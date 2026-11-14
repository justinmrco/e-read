require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

async function start() {
  for (const name of ['MONGODB_URI', 'JWT_SECRET', 'FRONTEND_URL', 'MIDTRANS_SERVER_KEY', 'MIDTRANS_SIGNATURE_KEY', 'MIDTRANS_CLIENT_KEY']) if (!process.env[name]) throw new Error('Missing required configuration: ' + name);
  if (Buffer.byteLength(process.env.JWT_SECRET) < 32) throw new Error('JWT_SECRET must contain at least 32 bytes');
  const origin = new URL(process.env.FRONTEND_URL);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== process.env.FRONTEND_URL) throw new Error('FRONTEND_URL must be an HTTP(S) origin without a trailing slash');
  const port = Number(process.env.PORT || 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  const app = express();
  app.disable('x-powered-by');
  // Keep trust proxy disabled until a trusted deployment proxy is explicitly configured.
  app.use(cors({ origin: origin.origin }));
  app.post('/api/midtrans/notification', express.raw({ type: 'application/json', limit: '100kb' }));
  app.use(express.json({ limit: '100kb', strict: true }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/books', require('./routes/books'));
  app.use('/api/midtrans', require('./routes/midtrans'));
  app.use('/api/user', require('./routes/user'));
  app.get('/', (req, res) => res.json({ name: 'E-Read', mode: 'sandbox' }));
  app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError && error.status === 400 ? 400 : [400, 404].includes(error.status) ? error.status : 500;
    res.status(status).json({ message: status === 500 ? 'Request failed. Please retry.' : status === 413 ? 'Request body is too large.' : 'Invalid request or unavailable resource.' });
  });
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const Transaction = require('./models/Transaction');
  if (await Transaction.countDocuments({ transactionStatus: 'pending', activeCheckout: { $ne: true } })) {
    console.error('Legacy pending orders require reconciliation before checkout can start. No records were changed.');
    throw new Error('Unreconciled legacy orders');
  }
  await Promise.all([require('./models/User'), require('./models/Book'), require('./models/Transaction')].map(model => model.init()));
  await Transaction.createIndexes();
  await require('./models/PaymentRecovery').init();
  const server = app.listen(port, () => console.log('E-Read sandbox API listening on port ' + port));
  server.on('error', async () => { console.error('Unable to listen on configured port.'); await mongoose.disconnect(); process.exitCode = 1; });
  return server;
}
if (require.main === module) start().catch(async () => { console.error('Startup failed. Check environment configuration, database availability, indexes, and port.'); await mongoose.disconnect(); process.exitCode = 1; });
module.exports = { start };
