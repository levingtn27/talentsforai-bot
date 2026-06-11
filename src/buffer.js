/**
 * Buffer API integration — creates LinkedIn draft posts
 */

const https = require('https');

const TOKEN   = process.env.BUFFER_ACCESS_TOKEN;
const CHANNEL = process.env.BUFFER_LINKEDIN_PROFILE_ID;

function bufferRequest(path, method, body) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body);
    const opts = {
      hostname: 'api.buffer.com',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Non-JSON response: ${data.slice(0, 200)}`)); }
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Buffer API timeout')); });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function createLinkedInDraft(text) {
  if (!TOKEN)   throw new Error('BUFFER_ACCESS_TOKEN not set in .env');
  if (!CHANNEL) throw new Error('BUFFER_LINKEDIN_PROFILE_ID not set in .env');

  const result = await bufferRequest('/graphql', 'POST', {
    query: `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post { id status }
          }
        }
      }
    `,
    variables: {
      input: {
        channelId: CHANNEL,
        text,
        schedulingType: 'automatic',
        mode: 'addToQueue',
        saveToDraft: true,
      }
    }
  });

  if (result?.errors) throw new Error(result.errors[0]?.message || 'GraphQL error');
  const errs = result?.data?.createPost?.errors;
  if (errs?.length) throw new Error(errs[0].message);
  return result?.data?.createPost?.post;
}

module.exports = { createLinkedInDraft };
