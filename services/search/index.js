const express = require('express');
const cors = require('cors');
const { Firestore } = require('@google-cloud/firestore');
const { VertexAI } = require('@google-cloud/vertexai');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Google Cloud clients
const firestore = new Firestore();
const vertex_ai = new VertexAI({ project: process.env.GOOGLE_CLOUD_PROJECT, location: 'us-central1' });
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
    const embeddingModel = vertex_ai.getGenerativeModel({ model: EMBEDDING_MODEL });
    // In Vertex AI standard SDK for embeddings (Vertex AI text-embeddings API)
    // Here we use a generic fetch to Google Cloud API or the generative model.
    // Assuming standard vertex embedding usage:
    const embedResponse = await fetch(`https://us-central1-aiplatform.googleapis.com/v1/projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/us-central1/publishers/google/models/${EMBEDDING_MODEL}:predict`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${await firestore.authClient.getAccessToken()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ instances: [{ content: query }] })
    });
    
    let queryVector = [];
    if (embedResponse.ok) {
        const embedData = await embedResponse.json();
        queryVector = embedData.predictions[0].embeddings.values;
    } else {
        // Mock fallback for local dev if GCP not fully configured
        queryVector = new Array(768).fill(0.1); 
    }

    // 2. Vector Search in Firestore
    const collRef = firestore.collection(COLLECTION_NAME);
    // Note: Firestore Vector Search requires findNearest
    let docs = [];
    try {
        const vectorQuery = collRef.findNearest('embedding', queryVector, {
            limit: 5,
            distanceMeasure: 'COSINE'
        });
        const snapshot = await vectorQuery.get();
        docs = snapshot.docs.map(doc => doc.data());
    } catch (e) {
        console.warn("Firestore Vector Search failed or not configured, using mock docs for dev");
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
      model: 'gemma-2-9b-it',
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
