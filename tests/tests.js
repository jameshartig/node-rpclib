var RPCLib = require('../rpc.js');

exports.createRPC = function(test) {
    var rpc = new RPCLib();
    test.ok(true);
    test.done();
};

exports.addMethod = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params) {});
    test.ok(true);
    test.done();
};

exports.addMethodOptions = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', {
        handler: function(){}
    });
    test.ok(true);
    test.done();
};

exports.handleTestRequest = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.addMethod('test', function(params, response) {
        test.equal(typeof params, 'object');
        test.equal(params.test, 'test');
        called = true;
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}));
    test.ok(called);
    test.done();
};

exports.handleTestRequestOptions = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.addMethod('test', {
        handler: function(params, response) {
            test.equal(typeof params, 'object');
            test.equal(params.test, 'test');
            called = true;
        },
        params: {
            test: {type: 'string', optional: false}
        }
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}));
    test.ok(called);
    test.done();
};

exports.handleTestRequests = function(test) {
    var rpc = new RPCLib(),
        calledCount = 0;
    rpc.addMethod('test', function(params, response) {
        calledCount++;
        test.equal(typeof params, 'object');
        test.equal(params.test, calledCount);
    }, {
        test: {type: 'number', optional: false}
    });
    rpc.handleRequest(JSON.stringify([
        {jsonrpc: '2.0', method: 'test', params: {test: 1}, id: 1},
        {jsonrpc: '2.0', method: 'test', params: {test: 2}, id: 2}
    ]));
    test.equal(calledCount, 2);
    test.done();
};

exports.preProcessor = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.addMethod('test', function() {}, {}, 9);
    rpc.setPreProcessor(function(req, resp, flags) {
        test.equal(req.method, 'test');
        test.strictEqual(flags, 9);
        called = true;
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}));
    test.ok(called);
    test.done();
};

exports.postProcessor = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.setPostProcessor(function(result, resppnse) {
        test.equal(typeof result.error, 'object');
        called = true;
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'blah', params: {}, id: 1}));
    test.ok(called);
    test.done();
};

exports.invalidMethodError = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.setPostProcessor(function(result, resppnse) {
        test.strictEqual(result.error.code, -32601);
        called = true;
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'blah', params: {}, id: 1}));
    test.ok(called);
    test.done();
};
