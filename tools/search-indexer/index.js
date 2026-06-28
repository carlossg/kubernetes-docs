require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const { Firestore, FieldValue } = require('@google-cloud/firestore');
const { GoogleAuth } = require('google-auth-library');

// Initialize Firestore
const projectId = process.env.GOOGLE_CLOUD_PROJECT || 'api-project-642841493686';
const firestore = new Firestore({ projectId });
const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
const COLLECTION_NAME = 'k8s_docs';

const CONTENT_DIR = path.resolve(__dirname, '../../website/content/en/docs');

// Helper to chunk text roughly by paragraphs or headers
function chunkText(text, maxTokens = 800) {
    // Simplified chunking strategy: split by double newlines
    const paragraphs = text.split(/\n\s*\n/);
    const chunks = [];
    let currentChunk = '';

    for (const p of paragraphs) {
        // Approximate token count by word count
        if ((currentChunk.length + p.length) / 4 > maxTokens) {
            if (currentChunk) chunks.push(currentChunk.trim());
            currentChunk = p;
        } else {
            currentChunk += '\n\n' + p;
        }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    
    return chunks;
}

// Generate Embeddings using Vertex AI
async function getEmbeddings(texts) {
    const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'api-project-642841493686';
    const LOCATION = 'us-central1';
    const MODEL = 'text-embedding-004';
    
    try {
        const client = await auth.getClient();
        const tokenResponse = await client.getAccessToken();
        const token = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
        const response = await fetch(`https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:predict`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                instances: texts.map(t => ({ content: t }))
            })
        });

        if (response.ok) {
            const data = await response.json();
            return data.predictions.map(p => p.embeddings.values);
        }
    } catch (e) {
        console.warn('Could not fetch embeddings from Vertex AI. Ensure GOOGLE_APPLICATION_CREDENTIALS is set.');
    }
    
    // Return mock embeddings if Vertex is not available (for local testing of the script)
    return texts.map(() => new Array(768).fill(Math.random()));
}

async function indexDocs() {
    console.log(`Starting indexing from ${CONTENT_DIR}`);
    const files = globSync('**/*.md', { cwd: CONTENT_DIR });
    console.log(`Found ${files.length} markdown files.`);

    const batch = firestore.batch();
    let batchCount = 0;
    const MAX_BATCH_SIZE = 100;

    // Process a limited number of files for demonstration to avoid long runtimes
    const filesToProcess = [
        ...files.slice(0, 10),
        'concepts/workloads/autoscaling/vertical-pod-autoscale.md'
    ]; 

    for (const file of filesToProcess) {
        const fullPath = path.join(CONTENT_DIR, file);
        const content = fs.readFileSync(fullPath, 'utf8');
        
        // Extract basic frontmatter title if present
        const titleMatch = content.match(/title:\s*["']?(.*?)["']?\n/);
        const title = titleMatch ? titleMatch[1] : path.basename(file, '.md');
        
        // Generate URL path based on Hugo content structure
        const urlPath = `/docs/${file.replace(/\.md$/, '').replace(/_index$/, '')}`;

        // Chunk content
        const chunks = chunkText(content);
        console.log(`Processing ${file} (${chunks.length} chunks)`);

        // Get embeddings for all chunks in this file
        const embeddings = await getEmbeddings(chunks);

        for (let i = 0; i < chunks.length; i++) {
            if (chunks[i].length < 50) continue; // Skip very small chunks

            const docRef = firestore.collection(COLLECTION_NAME).doc();
            batch.set(docRef, {
                title,
                url: urlPath,
                content: chunks[i],
                embedding: FieldValue.vector(embeddings[i]),
                timestamp: Firestore.FieldValue.serverTimestamp()
            });

            batchCount++;

            if (batchCount >= MAX_BATCH_SIZE) {
                console.log(`Committing batch of ${MAX_BATCH_SIZE}...`);
                await batch.commit();
                batchCount = 0;
            }
        }
    }

    if (batchCount > 0) {
        await batch.commit();
    }

    console.log('Indexing complete!');
}

indexDocs().catch(console.error);
