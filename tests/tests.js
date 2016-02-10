var Deferred = require('deferred'),
    RPCLib = require('../rpc.js');

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

exports.undefinedMethod = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}), {
        end: function(str) {
            var error = {code: -32601, message: 'Method not found', data: {method: 'test'}};
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: error, id: 1}));
            this.ended = true;
        },
        ended: false
    });
    test.done();
};

exports.removeMethod = function(test) {
    test.expect(2);
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        response.resolve(true);
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({
                jsonrpc: '2.0',
                result: true,
                id: 1
            }));
            this.ended = true;
        },
        ended: false
    });
    rpc.removeMethod('test');
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', id: 2}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({
                jsonrpc: '2.0',
                error: {code: -32601, message: 'Method not found', data: {method: 'test'}},
                id: 2
            }));
            this.ended = true;
        },
        ended: false
    });
    test.done();
};

exports.addMethodInvalidParams = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    test.throws(function() {
        rpc.addMethod('test', {
            handler: function() {
            },
            params: {
                test: null
            }
        });
    });
    test.done();
};

exports.addMethodStringParam = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    rpc.addMethod('test', {
        handler: function(params) {
            test.equal(typeof params.test, 'string');
        },
        params: {
            test: 'string'
        }
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}));
    test.done();
};

exports.addMethodNullParams = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    rpc.addMethod('test', {
        handler: function(params) {
            test.equal(Object.keys(params).length, 0);
        },
        params: null
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}));
    test.done();
};

exports.handleTestRequest = function(test) {
    var rpc = new RPCLib(),
        called = false,
        ended = false,
        originalReq = {};
    rpc.addMethod('test', function(params, response, httpReq) {
        test.equal(typeof params, 'object');
        test.equal(params.test, 'test');
        test.strictEqual(httpReq, originalReq);
        called = true;
        response.resolve({success: true});
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', result: {success: true}, id: 1}));
            this.ended = true;
            ended = true;
        },
        ended: false
    }, originalReq);
    test.ok(called);
    test.ok(ended);
    test.done();
};

exports.handleTestRequestReject = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.addMethod('test', function(params, response) {
        response.reject(1);
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: {code: 1}, id: 1}));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
    test.done();
};

exports.handleTestRequestRejectMessage = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.addMethod('test', function(params, response) {
        response.reject(1, 'Test');
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {test: 'test'}, id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: {code: 1, message: 'Test'}, id: 1}));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
    test.done();
};

exports.handleTestRequestRejectData = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.addMethod('test', {
        handler: function(params, response) {
            response.reject(1, 'Test', {extra: true});
        },
        params: {},
        errors: {
            1: 'test message'
        }
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: {code: 1, message: 'Test', data: {extra: true}}, id: 1}));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
    test.done();
};

exports.handleTestRequestDefaultMessage = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.addMethod('test', {
        handler: function(params, response) {
            response.reject(1);
        },
        params: {},
        errors: {
            1: 'test message'
        }
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({
                jsonrpc: '2.0',
                error: {code: 1, message: 'test message'},
                id: 1
            }));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
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

exports.handleEndThrowing = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        response.resolve(1);
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', id: 1}), {
        end: function() {
            throw new Error('Broke');
        },
        ended: false
    });
    test.ok(true);
    test.done();
};

exports.preProcessor = function(test) {
    var rpc = new RPCLib(),
        called = false,
        originalReq = {};
    rpc.addMethod('test', function() {}, {}, 9);
    rpc.setPreProcessor(function(req, resp, flags, httpReq) {
        test.equal(req.method, 'test');
        test.strictEqual(flags, 9);
        test.strictEqual(httpReq, originalReq);
        called = true;
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}), {
        end: function() {
            throw new Error('Broke');
        },
        ended: false
    }, originalReq);
    test.ok(called);
    test.done();
};

exports.preProcessorResolved = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.addMethod('test', function() {
        called = true;
    });
    rpc.setPreProcessor(function(req, resp) {
        resp.resolve();
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}));
    test.equal(called, false);
    test.done();
};

exports.preProcessorDeferred = function(test) {
    var rpc = new RPCLib(),
        dfd = new Deferred(),
        called = false;
    rpc.addMethod('test', function() {
        called = true;
    });
    rpc.setPreProcessor(function() {
        return dfd.promise;
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}));
    test.equal(called, false);
    dfd.resolve();
    test.equal(called, true);
    test.done();
};

exports.preProcessorResolvedDeferred = function(test) {
    var rpc = new RPCLib(),
        dfd = new Deferred(),
        called = false;
    rpc.addMethod('test', function() {
        called = true;
    });
    rpc.setPreProcessor(function(req, resp) {
        resp.resolve();
        return dfd.promise;
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}));
    dfd.resolve();
    test.equal(called, false);
    test.done();
};

exports.invalidJSON = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.handleRequest('blahblahblah', {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: {code: -32700, message: 'Parse error'}, id: null}));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
    test.done();
};

exports.invalidRPCVersion = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.handleRequest(JSON.stringify({method: 'test', params: {}}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: null}));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
    test.done();
};

exports.invalidRPCVersionID = function(test) {
    var rpc = new RPCLib(),
        ended = false;
    rpc.handleRequest(JSON.stringify({method: 'test', params: {}, id: 1}), {
        end: function(str) {
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: {code: -32600, message: 'Invalid Request'}, id: 1}));
            this.ended = true;
            ended = true;
        },
        ended: false
    });
    test.ok(ended);
    test.done();
};

exports.missingParams = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        response.resolve();
    }, {
        test: {type: 'number', optional: false}
    });
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', id: 1}), {
        end: function(str) {
            var error = {code: -32602, message: 'Invalid params', data: {
                param: 'test', expectedType: 'number', sentType: 'undefined'
            }};
            test.strictEqual(str, JSON.stringify({jsonrpc: '2.0', error: error, id: 1}));
            this.ended = true;
        },
        ended: false
    });
    test.done();
};

exports.setHeaderToJSON = function(test) {
    var rpc = new RPCLib(),
        called = false;
    rpc.handleRequest(JSON.stringify({jsonrpc: '2.0', method: 'test', params: {}, id: 1}), {
        end: function() {
            this.ended = true;
        },
        setHeader: function(name, value) {
            called = true;
            test.equal(name, 'Content-Type');
            test.equal(value, 'application/json');
        },
        ended: false
    });
    test.ok(called);
    test.done();
};

exports.callTest = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        test.equal(typeof params, 'object');
        test.equal(params.test, 'test');
        response.resolve({success: true});
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.call('test', {test: 'test'}, function(result) {
        test.notEqual(result.result, null);
        test.equal(result.result.success, true);
        test.done();
    });
};

exports.callTestInvalidParams = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', function() {
        test.fail();
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.call('test', function(result) {
        test.notEqual(result.error, null);
        test.strictEqual(result.error.code, -32602);
        test.done();
    });
};

exports.callTestArray = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        response.resolve({success: true});
    }, {
        test: {type: 'array', optional: false}
    });
    rpc.call('test', {test: []}, function(result) {
        test.ok(result.result.success);
        test.done();
    });
};

exports.callTestNotArray = function(test) {
    var rpc = new RPCLib();
    rpc.addMethod('test', function() {
        test.fail();
    }, {
        test: {type: 'array', optional: false}
    });
    rpc.call('test', {test: {}}, function(result) {
        test.strictEqual(result.error.code, -32602);
        test.done();
    });
};

exports.callTestResolveNull = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        response.resolve(null);
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.call('test', {test: 'test'}, function(result) {
        test.strictEqual(result.result, null);
        test.done();
    });
};

exports.callTestResolveUndefined = function(test) {
    test.expect(1);
    var rpc = new RPCLib();
    rpc.addMethod('test', function(params, response) {
        response.resolve();
    }, {
        test: {type: 'string', optional: false}
    });
    rpc.call('test', {test: 'test'}, function(result) {
        test.strictEqual(result.result, null);
        test.done();
    });
};
