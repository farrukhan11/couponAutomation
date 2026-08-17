const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';

async function askOllama(prompt) {
  const response = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false })
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || '';
}

function parseJsonResponse(text) {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1) throw new Error(`AI did not return JSON: ${text}`);
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function chooseElement(task, snapshot, extra = '') {
  const prompt = `
You are an ecommerce webpage element classifier.
You DO NOT control the browser. Code controls the browser.
Your only job is to identify the best visible element for the requested task.

TASK: ${task}
${extra}

Return ONLY JSON in exactly this shape:
{"found":true,"elementId":"e12","confidence":0.95,"reason":"short reason"}

If no suitable visible element exists, return:
{"found":false,"elementId":null,"confidence":0,"reason":"not visible"}

VISIBLE ELEMENTS:
${JSON.stringify(snapshot.elements)}
`;

  return parseJsonResponse(await askOllama(prompt));
}

module.exports = { askOllama, chooseElement, parseJsonResponse, OLLAMA_MODEL };
