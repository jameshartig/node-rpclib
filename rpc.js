var util = require('util'),
    debug;
debug = util.debuglog('rpclib');

function endResponse(respObj, response) {
    response.end(JSON.stringify(respObj));
}

function RPCAPI() {
    this.methods = {};
    this.preProcessor = null;
    this.postProcessor = endResponse;
    this.addMethod('rpc.describe', this._describeSelfHandler.bind(this));
}

RPCAPI.ERROR_PARSE_ERROR = -32700;
RPCAPI.ERROR_INVALID_REQUEST = -32600;
RPCAPI.ERROR_INVALID_METHOD = -32601;
RPCAPI.ERROR_INVALID_PARAMS = -32602;

RPCAPI.prototype.addMethod = function(name, handler, params, flags) {
    var obj = null,
        description, errors;
    if (typeof handler === 'object') {
        obj = handler;
        handler = obj.handler;
        params = obj.params; //undefined ok
        flags = obj.flags || 0;
        description = obj.description;
        errors = obj.errors;
    }
    if (typeof handler !== 'function') {
        throw new TypeError('Invalid handler method sent to addMethod for ' + name);
    }
    this.methods[name] = {
        params: params,
        handler: handler,
        flags: +flags,
        description: description,
        errors: errors
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

RPCAPI.prototype.setPostProcessor = function(func) {
    if (func === null) {
        this.postProcessor = null;
        return;
    }
    if (typeof func !== 'function') {
        throw new TypeError('Invalid function sent to setPostProcessor');
    }
    this.postProcessor = func;
};

RPCAPI.prototype.handleRequest = function(requestBody, httpResponse) {
    debug('handleRequest');
    var message = null,
        i = 0;
    try {
        message = JSON.parse(requestBody);
    } catch (ignore) {}
    if (message == null) {
        debug('Invalid JSON received');
        (new RPCResponse(this, httpResponse)).reject(RPCAPI.ERROR_PARSE_ERROR);
        return;
    }
    if (Array.isArray(message)) {
        for (i = 0; i < message.length; i++) {
            this._processRequest(message[i], httpResponse);
        }
    } else {
        this._processRequest(message, httpResponse);
    }
};

RPCAPI.prototype._processRequest = function(request, httpResponse) {
    var response = new RPCResponse(this, httpResponse),
        methodDetail = null,
        k = '',
        v = '',
        t = '',
        params = null;
    if (request.id === undefined) {
        response._setSilence(true);
    } else {
        response._setMessageID(request.id);
    }
    if (request.jsonrpc !== '2.0') {
        debug('Invalid jsonrpc value received');
        response.reject(RPCAPI.ERROR_INVALID_REQUEST);
        return;
    }
    if (typeof request.method !== 'string') {
        debug('Invalid method value received');
        response.reject(RPCAPI.ERROR_INVALID_REQUEST);
        return;
    }
    if (typeof request.params !== 'object') {
        debug('Invalid params value received');
        response.reject(RPCAPI.ERROR_INVALID_REQUEST);
        return;
    }

    methodDetail = this.methods[request.method];
    if (methodDetail === undefined) {
        debug('Method', request.method, 'doesnt exist');
        response.reject(RPCAPI.ERROR_INVALID_METHOD);
        return false;
    }
    if (methodDetail.params !== undefined) {
        for (k in methodDetail.params) {
            v = methodDetail.params[k];
            t = typeof request.params[k];
            if (v.type !== '*' && t !== v.type && (!v.optional || t !== 'undefined')) {
                debug('Method', request.method, 'requires param', k, 'to be type', v);
                response.reject(RPCAPI.ERROR_INVALID_PARAMS);
                return;
            }
        }
        params = request.params;
    }

    if (this.preProcessor !== null) {
        this.preProcessor(request, response, methodDetail.flags);
        if (response.resolved) {
            return;
        }
    }

    methodDetail.handler(params, response);
};

RPCAPI.prototype._describeSelfHandler = function(req, response) {
    var result = {},
        n;
    for (n in this.methods) {
        result[n] = this.methods[n].params || {};
    }
    response.resolve(result);
};


function respondError(errorCode, errorMessage, id) {
    var resp = {
        jsonrpc: '2.0',
        error: {
            code: errorCode
        },
        id: id
    };
    if (errorMessage !== undefined) {
        resp.error.message = errorMessage;
    }
    return resp;
}

function respondResult(result, id) {
    var resp = {
        jsonrpc: '2.0',
        result: result,
        id: id
    };
    return resp;
}

function RPCResponse(rpc, response) {
    this._rpc = rpc;
    this._response = response;
    this._messageID = null;
    this.keyVals = null;
    this.resolved = false;
    this._silent = false;
}
RPCResponse.prototype._setSilence = function(silent) {
    this._silent = !!silent;
};
RPCResponse.prototype._setMessageID = function(id) {
    this._messageID = id;
};
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
    if (this.resolved) {
        throw new Error('Cannot call resolve twice on a RPCResponse');
    }
    this.resolved = true;
    var resp = respondResult(result, this._messageID);
    if (this._rpc.postProcessor != null) {
        this._rpc.postProcessor(resp, this);
    }
};
RPCResponse.prototype.reject = function(errorCode, errorMessage) {
    if (this.resolved) {
        throw new Error('Cannot call resolve twice on a RPCResponse');
    }
    this.resolve = true;
    var resp = respondError(errorCode, errorMessage, this._messageID);
    if (this._rpc.postProcessor != null) {
        this._rpc.postProcessor(resp, this);
    }
};
RPCResponse.prototype.end = function(message) {
    if (this._silent) {
        this._response.end();
        return;
    }
    this._response.end(message);
};

module.exports = RPCAPI;
