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

exports.handleTestRequest = function(test) {
    var rpc = new RPCLib(),
        handlerCalled = false;
    rpc.addMethod('test', function(params, response) {
        test.equals(typeof params, 'object');
        test.equals(params.test, 'test');
        handlerCalled = true;
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}));
    test.ok(handlerCalled);
    test.done();
};
