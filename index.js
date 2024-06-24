const express = require('express');
const app = express();
const NodeMediaServer = require('node-media-server');
const indexRouter = require('./routes/index');
const cookieParser = require('cookie-parser');
require('./handlers/wsHandler');
require('./handlers/socketHandler');

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

app.use('/', indexRouter);

const nms = new NodeMediaServer({
  rtmp: {
    port: 1935,
    chunk_size: 60000,
    gop_cache: true,
    ping: 60,
    ping_timeout: 30
  }
});

nms.run();

app.listen(8080, function () {
  console.log('Started');
});
