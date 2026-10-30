const express = require('express');
const cors = require('cors');
const path = require('path');

const config = require('./config');
const apiRoutes = require('./routes/api.routes');
const { errorHandler } = require('./middleware/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(config.PUBLIC_DIR));

// Mount REST API
app.use('/api', apiRoutes);

// Fallback to index.html for SPA navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(config.PUBLIC_DIR, 'index.html'));
  }
  next();
});

// Central error handler
app.use(errorHandler);

module.exports = app;
