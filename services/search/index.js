const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const cors = require('cors');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { GoogleGenAI } = require('@google/genai');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Google Cloud clients
const { GoogleAuth } = require('google-auth-library');
const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'api-project-642841493686';
const firestore = new Firestore({ projectId });
const ai = new GoogleGenAI({});
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
// Cerebras client automatically uses CEREBRAS_API_KEY environment variable
const cerebras = new Cerebras(); 

const EMBEDDING_MODEL = 'text-embedding-004';
const COLLECTION_NAME = 'k8s_docs';

app.post('/api/search', async (req, res) => {
  try {
    const { query, level = 'developer', env = 'standard' } = req.body;
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
        const vectorQuery = collRef.findNearest('embedding', FieldValue.vector(queryVector), {
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

    // 4. Construct Context for LLMs
    const context = docs.map((d, i) => `[${i + 1}] ${d.title}\n${d.content}`).join('\n\n');
    let systemPrompt = `You are an expert Kubernetes assistant. Answer the user's question using the provided context. You may augment this context with target cloud-native platform specifications (like GKE, EKS, or AKS features) as specified in the environment rules below. If the core answer cannot be found in the context, say "I don't know." and do not make anything up. Always format your answer in clean HTML (using tags like <p>, <ul>, <li>, <strong>, <em>, <pre><code class="language-yaml">). Do not wrap the entire response in markdown block ticks, only return the HTML itself. Ensure all YAML or code snippets use exact resource names if mentioned in the query (e.g. if the user asks about deployment "myapp", use "myapp" in the YAML instead of generic names like "my-deployment").\n\nContext:\n${context}`;

    // Experience Level personalization
    if (level === 'beginner') {
      systemPrompt += '\n\nExplain basic terms, concepts, and architectural details before providing manifests. Keep the tone highly educational, clear, and beginner-friendly.';
    } else if (level === 'developer') {
      systemPrompt += '\n\nFocus strictly on application manifests, pod specifications, environment variables, container settings, and local volume mounts. Keep explanations highly concise and developer-centric.';
    } else if (level === 'operator') {
      systemPrompt += '\n\nFocus on cluster-wide administration, operational commands, troubleshooting flags, RBAC policies, custom resources, controller components, and production-grade settings.';
    }

    // Target Environment personalization
    if (env === 'standard') {
      systemPrompt += '\n\nAssume a standard Kubernetes cluster (like Minikube, Kind, or bare metal).';
    } else if (env === 'gke') {
      systemPrompt += '\n\nOptimize all advice, commands, and YAML manifests specifically for Google Kubernetes Engine (GKE). Integrate and mention GKE-native features (e.g., GKE-managed Metrics Server, Workload Identity, GCP cloud logging, GKE ingress controller, Google Cloud storage storageclass) where applicable.';
    } else if (env === 'eks') {
      systemPrompt += '\n\nOptimize all advice, commands, and YAML manifests specifically for Amazon Elastic Kubernetes Service (EKS). Integrate and mention EKS-native features (e.g., EKS load balancer controller annotations, IAM Roles for Service Accounts (IRSA), AWS CloudWatch, AWS storage classes) where applicable.';
    } else if (env === 'aks') {
      systemPrompt += '\n\nOptimize all advice, commands, and YAML manifests specifically for Azure Kubernetes Service (AKS). Integrate and mention AKS-native features (e.g., Azure Active Directory pod identity, Azure Files/Disk CSI driver, AKS load balancer settings, Azure Monitor) where applicable.';
    }

    // 5. Concurrently stream Cerebras and Gemini
    const cerebrasPromise = (async () => {
      try {
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
            res.write(JSON.stringify({ type: 'text', content, provider: 'cerebras', model: 'gemma-4-31b' }) + '\n');
          }
        }
      } catch (err) {
        console.error("Cerebras stream failed:", err.message);
        res.write(JSON.stringify({ type: 'text', content: '\n\nCerebras failed: ' + err.message, provider: 'cerebras', model: 'gemma-4-31b' }) + '\n');
      }
    })();

    const geminiPromise = (async () => {
      try {
        const responseStream = await ai.models.generateContentStream({
          model: 'gemini-3.5-flash',
          contents: [
            { role: 'user', parts: [{ text: systemPrompt + "\n\nUser Question:\n" + query }] }
          ]
        });
        for await (const chunk of responseStream) {
          const content = chunk.text || '';
          if (content) {
            res.write(JSON.stringify({ type: 'text', content, provider: 'gemini', model: 'gemini-3.5-flash' }) + '\n');
          }
        }
      } catch (err) {
        console.error("Gemini stream completely failed:", err.message);
        res.write(JSON.stringify({ type: 'text', content: '\n\nGemini failed: ' + err.message, provider: 'gemini', model: 'gemini-failed' }) + '\n');
      }
    })();

    await Promise.all([cerebrasPromise, geminiPromise]);
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
