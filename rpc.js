var util = require('util'),
    debug;

var RPC_ERROR_PARSE_ERROR = -32700,
    RPC_ERROR_INVALID_REQUEST = -32600,
    RPC_ERROR_INVALID_METHOD = -32601,
    RPC_ERROR_INVALID_PARAMS = -32602;

debug = util.debuglog('hapnn-api');

function RPCAPI() {
    this.methods = {};
    this.preProcessor = null;
}

RPCAPI.prototype.addMethod = function(name, handler, params, flags) {
    if (typeof handler !== 'function') {
        throw new TypeError('Invalid handler method sent to addMethod for ' + name);
    }
    this.methods[name] = {
        params: params,
        handler: handler,
        flags: +flags
    };
};

RPCAPI.prototype.setPreProcessor = function(func) {
    if (func === null) {
        this.preProcessor = null;
        return;
    }
    if (typeof func !== 'function') {
        throw new TypeError('Invalid function sent to setPreProcessor');
    }
    this.preProcessor = func;
};

function respondError(errorCode, id, response) {
    var resp = {
        jsonrpc: '2.0',
        error: {
            code: errorCode
        },
        id: id
    };
    response.write(JSON.stringify(resp));
}

function respondResult(result, id, response) {
    var resp = {
        jsonrpc: '2.0',
        result: result,
        id: id
    };
    response.write(JSON.stringify(resp));
}

RPCAPI.prototype.handleRequest = function(request, response) {
    debug('handleRequest');
    var message = null,
        methodDetail = null,
        k = '',
        v = '',
        t = '',
        messageID = null,
        shouldRespond = true,
        params = null,
        respObj = null;
    try {
        message = JSON.parse(request);
    } catch (ignore) {}
    if (message == null) {
        debug('Invalid JSON received');
        if (shouldRespond) {
            respondError(RPC_ERROR_PARSE_ERROR, messageID, response);
        }
        return;
    }
    if (message.id === undefined) {
        shouldRespond = false;
    } else {
        messageID = message.id;
    }
    if (message.jsonrpc !== '2.0') {
        debug('Invalid jsonrpc value received');
        if (shouldRespond) {
            respondError(RPC_ERROR_INVALID_REQUEST, messageID, response);
        }
        return;
    }
    if (typeof message.method !== 'string') {
        debug('Invalid method value received');
        if (shouldRespond) {
            respondError(RPC_ERROR_INVALID_REQUEST, messageID, response);
        }
        return;
    }
    if (typeof message.params !== 'object') {
        debug('Invalid params value received');
        if (shouldRespond) {
            respondError(RPC_ERROR_INVALID_REQUEST, messageID, response);
        }
        return;
    }

    methodDetail = this.methods[message.method];
    if (methodDetail === undefined) {
        debug('Method', message.method, 'doesnt exist');
        if (shouldRespond) {
            respondError(RPC_ERROR_INVALID_METHOD, messageID, response);
        }
        return false;
    }
    if (methodDetail.params !== undefined) {
        for (k in methodDetail.params) {
            v = methodDetail.params[k];
            t = typeof message.params[k];
            if (v.type !== '*' && t !== v.type && (!v.optional || t !== 'undefined')) {
                debug('Method', message.method, 'requires param', k, 'to be type', v);
                if (shouldRespond) {
                    respondError(RPC_ERROR_INVALID_PARAMS, messageID, response);
                }
                return;
            }
        }
        params = message.params;
    }

    respObj = new RPCResponse(response, messageID);
    if (this.preProcessor !== null) {
        this.preProcessor(message, methodDetail, respObj);
    }

    methodDetail.handler(params, response);
};

function RPCResponse(response, messageID) {
    this._response = response;
    this._messageID = messageID;
    this.keyVals = null;
}
RPCResponse.prototype.set = function(name, value) {
    if (this.keyVals === null) {
        this.keyVals = {};
    }
    this.keyVals[name] = value;
};
RPCResponse.prototype.get = function(name) {
    if (this.keyVals === null) {
        return undefined;
    }
    return this.keyVals[name];
};
RPCResponse.prototype.resolve = function(result) {
    respondResult(result, this._messageID, this._response);
};
RPCResponse.prototype.reject = function(errorCode, errorMessage) {
    respondError(errorCode, this._messageID, this._response);
};

module.exports = RPCAPI;
