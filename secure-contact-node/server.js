const http = require('http');
const url = require('url');
const fs = require('fs');
const querystring = require('querystring');

const PORT = 3000;
const DATA_FILE = 'data.json';

//this ensures that the data file exists
if (!fs.existsSync(DATA_FILE)){
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // POST /contact
  if (req.method === 'POST' && parsedUrl.pathname === '/contact') {
    let body = '';

    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { name, email, message } = data;

        if (!name || !email || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing fields' }));
          return;
        }

        const contacts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        contacts.push({ name, email, message });
        fs.writeFileSync(DATA_FILE, JSON.stringify(contacts, null, 2));

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Contact saved' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });

  // GET /contacts
  } else if (req.method === 'GET' && parsedUrl.pathname === '/contacts') {
    const authHeader = req.headers['authorization'];
    console.log('Authorization Header:', authHeader);

    if (authHeader !== 'Bearer 123') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    const contacts = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(contacts));

  } else {
    // Not Found
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);

});