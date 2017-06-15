var http = require('http'),
    RPCLib = require('../rpc.js'),
    rpc = new RPCLib(),
    listenOptions = {port: 14999, host: '127.0.0.1'},
    httpPath = 'http://' + listenOptions.host + ':' + listenOptions.port + '/',
    client = new RPCLib.RPCClient(httpPath),
    listening = false, server;

rpc.addMethod('test', function(params, response) {
    response.resolve(params || {});
}, {test: {type: 'string', optional: true}});

rpc.addMethod('wait', function(params, response) {
    setTimeout(function() {
        response.resolve({done: true});
    }, params.timeout);
}, { timeout: 'number' });

rpc.addMethod('headers', function (params, response, req) {
    response.resolve(req.headers);
}, {});

server = http.createServer(function(req, res) {
    req.on('data', function(body) {
        rpc.handleRequest(body.toString(), res, req);
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

exports.callHeaders = function (test) {
    test.expect(2);
    client.call('headers', { }, function (err, res) {
        test.strictEqual(err, null);
        test.equal(res['x-test'], 'test');
        test.done();
    }, { headers: { 'X-Test': 'test' } });
};

exports.callPromise = function(test) {
    test.expect(2);
    var result = client.call('test', {test: 'test'}).then(function(res) {
        test.equal(res.test, 'test');
        test.done();
    });
    test.equal(result.clientURL, httpPath);
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

exports.callInvalidMethodPromise = function(test) {
    test.expect(1);
    client.call('invalidMethod').catch(function(err) {
        test.strictEqual(err.code, RPCLib.ERROR_INVALID_METHOD);
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

exports.setTimeout = function(test) {
    test.expect(2);
    var clientRes;
    clientRes = client.call('wait', {timeout: 200}, function(err) {
        test.strictEqual(err.code, 0);
        test.equal(err.type, 'timeout');
        test.done();
    }).setTimeout(100);
};

exports.setTimeoutPromise = function(test) {
    test.expect(2);
    var clientRes;
    clientRes = client.call('wait', {timeout: 200}).catch(function(err) {
        test.strictEqual(err.code, 0);
        test.equal(err.type, 'timeout');
        test.done();
    }).setTimeout(100);
};

exports.setTimeoutZero = function(test) {
    test.expect(1);
    var clientRes;
    clientRes = client.call('wait', {timeout: 200}, function(err, res) {
        test.ok(res && res.done);
        test.done();
    }).setTimeout(100).setTimeout(0);
};

exports.abort = function(test) {
    test.expect(2);
    var ran = false,
        clientRes;
    clientRes = client.call('test', function() {
        ran = true;
    }).setTimeout(100).abort();
    test.strictEqual(clientRes.timer, null);
    setTimeout(function() {
        test.ok(!ran);
        test.done();
    }, 100);
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
