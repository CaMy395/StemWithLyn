import express from 'express';
import { readFileSync } from 'fs';
import axios from 'axios';
import os from 'os';
import { fileURLToPath } from 'url';
import path from 'path';


const router = express.Router();

// Ensure the correct base directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the correct path for both Windows and Linux
const backendEmbeddingsPath = path.join(__dirname, '..',  'embeddings.json');

const faqsPath = path.join(__dirname, '..', '..', 'shared', 'faqs.json');

// Declare embeddings variable globally
let embeddings = [];

try {
    console.log('Attempting to load embeddings from:', backendEmbeddingsPath);
    const rawEmbeddings = readFileSync(backendEmbeddingsPath, 'utf8');
    embeddings = JSON.parse(rawEmbeddings);

    console.log('Successfully loaded embeddings. Sample:', embeddings[0]);

    // Validate all embeddings
    embeddings.forEach((embedding, index) => {
        if (!Array.isArray(embedding) || embedding.length !== 384) {
            console.error(`Embedding at index ${index} is invalid.`);
        } else {
            console.log(`Embedding at index ${index} is valid.`);
        }
    });

} catch (error) {
    console.error('Error loading embeddings:', error.message);
    throw error; // Stop execution if embeddings cannot be loaded
}

// Load FAQs
const faqs = JSON.parse(readFileSync(faqsPath, 'utf8'));

// Cosine similarity function
function cosineSimilarity(vec1, vec2) {
    const dotProduct = vec1.reduce((sum, val, idx) => sum + val * vec2[idx], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val ** 2, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val ** 2, 0));
    return dotProduct / (magnitude1 * magnitude2);
}

const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'development') {
        return 'http://127.0.0.1:5000';
    } else {
        return 'https://ReadyPortal.onrender.com';  // Use the actual Render URL
    }
};


// Utility function to get embedding from Python service
async function getEmbedding(question) {
    try {
        const baseUrl = getBaseUrl();
        const response = await axios.post(`${baseUrl}/embed`, { text: question });

        console.log('Response from Python service:', response.data); // Debug log
        return response.data.embedding; // Access the "embedding" key from the response
    } catch (error) {
        console.error('Error calling Python service:', error.message); // Log error
        throw new Error('Failed to generate embedding');
    }
}

// Chatbot route
router.post('/', async (req, res) => {
    const { question } = req.body;

    if (!question) {
        return res.status(400).json({ error: 'No question provided' });
    }

    try {
        console.log('Received question:', question);

        // Step 1: Generate the embedding for the user's question
        const questionEmbedding = await getEmbedding(question);
        console.log('Generated question embedding dimensions:', questionEmbedding.length);

        // Step 2: Find the most similar FAQ using cosine similarity
        let maxSimilarity = -1;
        let bestMatch = null;

        embeddings.forEach((faqEmbedding, index) => {
            if (!Array.isArray(faqEmbedding) || faqEmbedding.length !== 384) {
                console.error(`Invalid embedding for FAQ[${index}].`);
                return;
            }

            const similarity = cosineSimilarity(questionEmbedding, faqEmbedding);
            console.log(`Similarity with FAQ[${index}]: ${similarity}`);

            if (similarity > maxSimilarity) {
                maxSimilarity = similarity;
                bestMatch = faqs[index];
            }
        });

        console.log('Best match:', bestMatch);
        console.log('Max similarity:', maxSimilarity);

        // Step 3: Define a similarity threshold and return the response
        const similarityThreshold = 0.5;

        if (maxSimilarity >= similarityThreshold) {
            return res.json({ answer: bestMatch.answer });
        } else {
            return res.json({
                answer: bestMatch
                    ? `Closest match: ${bestMatch.answer} (but similarity was too low)`
                    : "I'm sorry, I couldn't find an answer to your question. Please try rephrasing or contact support.",
            });
        }
    } catch (error) {
        console.error('Error handling chatbot query:', error);
        res.status(500).json({ error: 'Failed to process the question' });
    }
});

export default router;
