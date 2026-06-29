# AI-Counil

## Azure AI Foundry keys

Add your Azure AI Foundry values to `.env`.

```env
AZURE_AI_FOUNDRY_ENDPOINT=https://YOUR-RESOURCE.services.ai.azure.com/models
AZURE_AI_FOUNDRY_API_KEY=YOUR_AZURE_AI_FOUNDRY_KEY
```

The app sends prompts through `app/api/chat/route.ts`, so API keys stay on the server. The current council members are Kimi, Mistral, OpenAI, Grok, and DeepSeek. Use the exact Azure deployment names, for example `Mistral-Large-3`, not the provider display name.

OpenAI can use a separate Azure OpenAI resource through `AZURE_AI_FOUNDRY_OPENAI_ENDPOINT`, `AZURE_AI_FOUNDRY_OPENAI_API_KEY`, `AZURE_AI_FOUNDRY_OPENAI_DEPLOYMENT`, and `AZURE_AI_FOUNDRY_OPENAI_API_VERSION`.
