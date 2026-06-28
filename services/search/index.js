const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const { VertexAI } = require('@google-cloud/vertexai');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Google Cloud clients
const { GoogleAuth } = require('google-auth-library');
const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'api-project-642841493686';
const firestore = new Firestore({ projectId });
const vertex_ai = new VertexAI({ project: projectId, location: 'us-central1' });
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
// Cerebras client automatically uses CEREBRAS_API_KEY environment variable
const cerebras = new Cerebras(); 

const EMBEDDING_MODEL = 'text-embedding-004';
const COLLECTION_NAME = 'k8s_docs';

app.post('/api/search', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // 1. Generate Query Embedding using Vertex AI
    let queryVector = [];
    try {
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
        
        if (token) {
            const embedResponse = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${EMBEDDING_MODEL}:predict`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ instances: [{ content: query }] })
            });
            
            if (embedResponse.ok) {
                const embedData = await embedResponse.json();
                queryVector = embedData.predictions[0].embeddings.values;
            }
        }
    } catch (e) {
        console.warn("Failed to fetch Vertex AI embeddings, falling back to mock vector:", e.message);
    }
    
    if (!queryVector || queryVector.length === 0) {
        queryVector = new Array(768).fill(0.1); 
    }

    // 2. Vector Search in Firestore
    let docs = [];
    try {
        const collRef = firestore.collection(COLLECTION_NAME);
        const vectorQuery = collRef.findNearest('embedding', queryVector, {
            limit: 5,
            distanceMeasure: 'COSINE'
        });
        const snapshot = await vectorQuery.get();
        docs = snapshot.docs.map(doc => doc.data());
    } catch (e) {
        console.warn("Firestore Vector Search failed or not configured, using mock docs for dev:", e.message);
    }

    if (docs.length === 0) {
        docs = [
            { title: "Kubernetes Basics", url: "/docs/concepts/overview/what-is-kubernetes/", content: "Kubernetes is a portable, extensible, open source platform for managing containerized workloads and services." },
            { title: "Pods", url: "/docs/concepts/workloads/pods/", content: "Pods are the smallest deployable units of computing that you can create and manage in Kubernetes." }
        ];
    }

    // 3. Send citations first
    const citations = docs.map(d => ({ title: d.title, url: d.url, snippet: d.content.substring(0, 150) + "..." }));
    res.write(JSON.stringify({ type: 'citations', citations }) + '\n');

    // 4. Construct Context for Cerebras
    const context = docs.map((d, i) => `[${i+1}] ${d.title}\n${d.content}`).join('\n\n');
    const systemPrompt = `You are a Kubernetes documentation assistant. Answer the user's question using ONLY the provided context. If the context doesn't contain the answer, say you don't know.\n\nContext:\n${context}`;

    // 5. Generate Answer with Cerebras (Gemma)
    const stream = await cerebras.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ],
      model: 'gemma-4-31b',
      stream: true,
      max_tokens: 1024,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(JSON.stringify({ type: 'text', content }) + '\n');
      }
    }

    res.end();
  } catch (error) {
    console.error('API Error:', error);
    res.write(JSON.stringify({ type: 'text', content: '\n\nAn error occurred while generating the answer.' }) + '\n');
    res.end();
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Kubernetes Search Backend listening on port ${PORT}`);
});
