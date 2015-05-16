var http = require('http'),
    RPCLib = require('../rpc.js'),
    rpc = new RPCLib(),
    listenOptions = {port: 14999, host: '127.0.0.1'},
    httpPath = 'http://' + listenOptions.host + ':' + listenOptions.port,
    client = new RPCLib.RPCClient(httpPath),
    listening = false, server;

rpc.addMethod('test', function(params, response) {
    response.resolve(params || {});
}, {test: {type: 'string', optional: true}});

server = http.createServer(function(req, res) {
    req.on('data', function(body) {
        rpc.handleRequest(body.toString(), res);
    });
});

function listen(cb) {
    listening = true;
    server.listen(listenOptions.port, listenOptions.host, cb);
    //we don't care if we die and the server is still around
    //todo: for some reason this isn't working so we need serverClose
    server.unref();
}

exports.setUp = function(callback) {
    if (listening) {
        callback();
        return;
    }
    listen(callback);
};

exports.callSimple = function(test) {
    test.expect(2);
    client.call('test', {test: 'test'}, function(err, res) {
        test.strictEqual(err, null);
        test.equal(res.test, 'test');
        test.done();
    });
};

exports.callNoParams = function(test) {
    test.expect(1);
    client.call('test', function(err, res) {
        test.strictEqual(res.test, undefined);
        test.done();
    });
};

exports.callInvalidMethod = function(test) {
    test.expect(2);
    client.call('invalidMethod', function(err, res) {
        test.strictEqual(err.code, RPCLib.ERROR_INVALID_METHOD);
        test.strictEqual(res, null);
        test.done();
    });
};

exports.brokenURL = function(test) {
    test.expect(2);
    var client2 = new RPCLib.RPCClient('http://broken');
    client2.call('test', function(err) {
        test.strictEqual(err.code, 0);
        test.equal(err.socketError.code, 'ENOTFOUND');
        test.done();
    });
};


/**
 * This MUST be the last test run!
 */
exports.serverClose = function(test) {
    if (!listening) {
        test.done();
        return;
    }
    server.close(function() {
        test.done();
    });
};
