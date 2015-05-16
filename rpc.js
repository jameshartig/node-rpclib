var util = require('util'),
    assert = require('assert'),
    debug;
debug = util.debuglog('rpclib');

function RPCLib() {
    this.methods = {};
    this.preProcessor = null;
    this.addMethod('rpc.describe', {
        handler: this._describeSelfHandler.bind(this),
        internal: true
    });
}

RPCLib.ERROR_PARSE_ERROR = -32700;
RPCLib.ERROR_INVALID_REQUEST = -32600;
RPCLib.ERROR_INVALID_METHOD = -32601;
RPCLib.ERROR_INVALID_PARAMS = -32602;
RPCLib.ERROR_INTERNAL_ERROR = -32603;
RPCLib.ERROR_SERVER_ERROR = -32000;

RPCLib.prototype.addMethod = function(name, handler, params, flags) {
    var obj = null,
        internal = false,
        description, errors;
    if (typeof handler === 'object') {
        obj = handler;
        handler = obj.handler;
        params = obj.params; //undefined ok
        flags = obj.flags || 0;
        description = obj.description;
        errors = obj.errors;
        internal = obj.internal;
    }
    if (typeof handler !== 'function') {
        throw new TypeError('Invalid handler method sent to addMethod for ' + name);
    }
    this.methods[name] = {
        params: params,
        handler: handler,
        flags: +flags,
        description: description,
        errors: errors,
        internal: internal
    };
};

RPCLib.prototype.setPreProcessor = function(func) {
    if (func === null) {
        this.preProcessor = null;
        return;
    }
    if (typeof func !== 'function') {
        throw new TypeError('Invalid function sent to setPreProcessor');
    }
    this.preProcessor = func;
};

RPCLib.prototype.handleRequest = function(requestBody, httpResponse) {
    debug('handleRequest');
    var message = null,
        i = 0,
        responseGroup;
    try {
        message = JSON.parse(requestBody);
    } catch (e) {
        debug('JSON Error', e);
    }
    if (Array.isArray(message)) {
        responseGroup = new RPCResponseGroup(httpResponse);
        for (i = 0; i < message.length; i++) {
            this._processRequest(message[i], httpResponse, responseGroup);
        }
    } else {
        this._processRequest(message, httpResponse);
    }
};

function endResponse(respObj, response) {
    if (response.get('silent')) {
        response.end('');
    } else {
        response.end(JSON.stringify(respObj));
    }
    return respObj;
}

RPCLib.prototype._processRequest = function(request, httpResponse, responseGroup) {
    var response = new RPCResponse(httpResponse),
        methodDetail = null,
        k = '',
        v = '',
        t = '',
        params = null;

    response.always(endResponse.bind(this));
    if (responseGroup) {
        responseGroup.add(response);
    }

    if (typeof request !== 'object' || request === null) {
        debug('Invalid json received');
        response.reject(RPCLib.ERROR_PARSE_ERROR);
        return;
    }

    if (request.id === undefined) {
        response.set('silent', true);
    } else {
        response._setMessageID(request.id);
    }
    if (request.jsonrpc !== '2.0') {
        debug('Invalid jsonrpc value received');
        response.reject(RPCLib.ERROR_INVALID_REQUEST);
        return;
    }
    if (typeof request.method !== 'string') {
        debug('Invalid method value received');
        response.reject(RPCLib.ERROR_INVALID_REQUEST);
        return;
    }
    if ((typeof request.params !== 'object' && request.params !== undefined) || request.params === null) {
        debug('Invalid params value received');
        response.reject(RPCLib.ERROR_INVALID_REQUEST);
        return;
    }

    methodDetail = this.methods[request.method];
    if (methodDetail === undefined) {
        debug('Method', request.method, 'doesnt exist');
        response.reject(RPCLib.ERROR_INVALID_METHOD);
        return false;
    }
    if (methodDetail.params !== undefined) {
        for (k in methodDetail.params) {
            v = methodDetail.params[k];
            t = typeof request.params[k];
            if (v.type !== '*' && t !== v.type && (!v.optional || t !== 'undefined')) {
                debug('Method', request.method, 'requires param', k, 'to be type', v);
                response.reject(RPCLib.ERROR_INVALID_PARAMS);
                return;
            }
        }
        params = request.params;
    }

    try {
        if (this.preProcessor !== null && methodDetail.internal !== true) {
            debug('Calling preProcessor');
            this.preProcessor(request, response, methodDetail.flags);
            if (response.resolved) {
                debug('preProcessor resolved response');
                return;
            }
        }

        debug('Calling handler for', request.method);
        methodDetail.handler(params, response);
    } catch (e) {
        response.reject(RPCLib.ERROR_INTERNAL_ERROR);
        throw e;
    }
};

RPCLib.prototype._describeSelfHandler = function(req, response) {
    var result = {},
        n;
    for (n in this.methods) {
        if (this.methods[n].internal === true) {
            continue;
        }
        result[n] = {
            description: this.methods[n].description,
            params: this.methods[n].params || {},
            errors: this.methods[n].errors
        };
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
        result: result || {},
        id: id
    };
    return resp;
}

function callAlways(response) {
    if (response._alwaysCallbacks === null) {
        return;
    }
    var callbacks = response._alwaysCallbacks,
        i, arr, cb;
    //always make sure the callbacks are null otherwise we might infinite loop
    response._alwaysCallbacks = null;
    try {
        if (Array.isArray(callbacks)) {
            for (i = 0; i < callbacks.length; i++) {
                response.result = callbacks[i](response.result, response);
            }
        } else {
            response.result = callbacks(response.result, response);
        }
    } catch (e) {
        if (response.get('silent')) {
            response.end('');
        } else {
            response.end(JSON.stringify(response.reject(RPCLib.ERROR_INTERNAL_ERROR)));
        }
        throw e;
    }
}

function RPCResponse(httpResponse) {
    this._httpResponse = httpResponse;
    this._messageID = null;
    this._alwaysCallbacks = null;
    this.keyVals = null;
    this.resolved = false;
    this.result = null;
}
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
    debug('RPCResponse resolved');
    this.resolved = true;
    this.result = respondResult(result, this._messageID);
    callAlways(this);
};
RPCResponse.prototype.reject = function(errorCode, errorMessage) {
    debug('RPCResponse rejected with code', errorCode);
    this.resolved = true;
    this.result = respondError(errorCode, errorMessage, this._messageID);
    callAlways(this);
};
RPCResponse.prototype.always = function(func) {
    if (typeof func !== 'function') {
        throw new TypeError('param passed to always is not a function');
    }
    if (this._alwaysCallbacks === null) {
        this._alwaysCallbacks = func;
    } else if (Array.isArray(this._alwaysCallbacks)) {
        this._alwaysCallbacks.push(func);
    } else {
        this._alwaysCallbacks = [this._alwaysCallbacks, func];
    }
};
function RPCResponseEnd(message) {
    if (!this._httpResponse || this._httpResponse.ended) {
        return;
    }
    debug('Ending RPCResponse');
    this._httpResponse.setHeader('Content-Type', 'application/json');
    if (message !== undefined) {
        if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
            this._httpResponse.end(JSON.stringify(message));
        } else {
            this._httpResponse.end(message);
        }
    } else {
        this._httpResponse.end(JSON.stringify(this.result));
    }
}
RPCResponse.prototype.end = RPCResponseEnd;

function RPCResponseGroup(httpResponse) {
    this._httpResponse = httpResponse;
    this.ended = false;
    this.responses = [];
    this.results = [];
    this._resolvedCount = 0;
}
RPCResponseGroup.prototype.add = function(response, rpc) {
    var f = function(respObj, response) {
            if (!response.get('silent')) {
                this.results.push(JSON.stringify(respObj));
            }
            this._resolvedCount++;
            if (this._resolvedCount >= this.responses.length) {
                assert.notEqual(this.ended, true);
                this.ended = true;
                this.end();
            }
        };
    //clear out _httpResponse so end() doesn't end on it
    response._httpResponse = null;
    response.always(f.bind(this));
};
RPCResponseGroup.prototype.end = RPCResponseEnd;


module.exports = RPCLib;
