var util = require('util'),
    assert = require('assert'),
    http = require('http'),
    url = require('url'),
    bufferConcatLimit = require("buffer-concat-limit"),
    _EMPTY_OBJECT_ = {},
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

var PREDEFINED_ERROR_MESSAGES = {
    '-32700': 'Parse error',
    '-32600': 'Invalid Request',
    '-32601': 'Method not found',
    '-32602': 'Invalid params',
    '-32603': 'Internal error',
    '-32000': 'Server error'
};

RPCLib.prototype.addMethod = function(name, handler, params, flags) {
    var obj = null,
        internal = false,
        errors = null,
        description, n;
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
    if (typeof params !== 'object' || params === null) {
        params = _EMPTY_OBJECT_;
    } else {
        for (n in params) {
            if (!params.hasOwnProperty(n)) {
                continue;
            }
            if (typeof params[n] === 'string') {
                params[n] = {
                    type: params[n],
                    optional: false
                };
            } else if (!params[n]) {
                throw new TypeError('Invalid param sent to addMethod for param ' + n);
            }
        }
    }
    if (errors !== undefined && typeof errors !== 'object') {
        throw new TypeError('Invalid error sent to addMethod for ' + name);
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

RPCLib.prototype.removeMethod = function(name) {
    if (this.methods.hasOwnProperty(name)) {
        delete this.methods[name];
    }
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

RPCLib.prototype.call = function(name, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }
    if (typeof callback !== 'function') {
        throw new TypeError('callback sent to RPCLib.call must be a function');
    }
    this._processRequest({
        jsonrpc: '2.0',
        method: name,
        params: params || {},
        id: 1
    }, callback);
};

function endResponse(respObj, response) {
    if (response._silent) {
        response.end('');
    } else {
        response.end(respObj);
    }
    return respObj;
}

function callHandler(handler, params, response, request) {
    debug('Calling handler for', request.method);
    handler(params, response);
}

RPCLib.prototype._processRequest = function(request, httpResponse, responseGroup) {
    var response = new RPCResponse(httpResponse),
        methodDetail = null,
        k = '',
        v = '',
        t = '',
        params = null,
        dfd = null;

    response.always(endResponse);
    if (responseGroup) {
        responseGroup.add(response);
    }

    if (typeof request !== 'object' || request === null) {
        debug('Invalid json received');
        response.reject(RPCLib.ERROR_PARSE_ERROR);
        return;
    }

    if (request.id === undefined) {
        response._silent = true;
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
    for (k in methodDetail.params) {
        if (!methodDetail.params.hasOwnProperty(k)) {
            continue;
        }
        v = methodDetail.params[k];
        t = typeof request.params[k];
        if (v.type === 'array' && t === 'object' && Array.isArray(request.params[k])) {
            t = 'array';
        }
        if (v.type !== '*' && t !== v.type && (!v.optional || t !== 'undefined')) {
            debug('Method', request.method, 'requires param \"' + k + '" to be type', v, 'was', t);
            response.reject(RPCLib.ERROR_INVALID_PARAMS);
            return;
        }
    }
    params = request.params;

    if (methodDetail.errors !== null) {
        response._predefinedErrors = methodDetail.errors;
    }

    try {
        if (this.preProcessor !== null && methodDetail.internal !== true) {
            debug('Calling preProcessor');
            dfd = this.preProcessor(request, response, methodDetail.flags);
            //if they returned a dfd wait until its done before calling handler
            if (dfd && typeof dfd.then === 'function') {
                //call done so it throws if there's an error but we're not guranateed everything will support done >_<
                dfd[typeof dfd.done === 'function' ? 'done' : 'then'](function() {
                    if (response.resolved) {
                        debug('preProcessor resolved response');
                        return;
                    }
                    callHandler(methodDetail.handler, params, response, request);
                });
                return;
            }
            if (response.resolved) {
                debug('preProcessor resolved response');
                return;
            }
        }

        callHandler(methodDetail.handler, params, response, request);
    } catch (e) {
        debug('Error from handler/preProcessor call', e);
        response.reject(RPCLib.ERROR_INTERNAL_ERROR);
        throw e;
    }
};

RPCLib.prototype._describeSelfHandler = function(req, response) {
    var result = {},
        n;
    for (n in this.methods) {
        if (!this.methods.hasOwnProperty(n) || this.methods[n].internal === true) {
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


function respondError(errorCode, errorMessage, id, errorData) {
    var resp = {
        jsonrpc: '2.0',
        error: {
            code: errorCode,
            message: errorMessage || PREDEFINED_ERROR_MESSAGES[errorCode]
        },
        id: id
    };
    //!= handles undefined and null
    if (errorData != null) {
        resp.error.data = errorData;
    }
    return resp;
}

function respondResult(res, id) {
    //don't allow undefined since that would result in the result key missing from json
    var result = res !== undefined ? res : null,
        resp = {
            jsonrpc: '2.0',
            result: result,
            id: id
        };
    return resp;
}

function callAlways(response) {
    if (response._alwaysCallbacks === null) {
        return;
    }
    var callbacks = response._alwaysCallbacks,
        i;
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
        if (response._silent) {
            response.end('');
        } else {
            response.end(JSON.stringify(response.reject(RPCLib.ERROR_INTERNAL_ERROR)));
        }
        throw e;
    }
}

function RPCResponse(httpResponse) {
    if (typeof httpResponse === 'function') {
        this._httpResponse = {
            end: function(result) {
                this.ended = true;
                httpResponse(result);
            },
            ended: false
        };
        this._rawResult = true;
    } else {
        this._httpResponse = httpResponse;
    }
}
RPCResponse.prototype._silent = false;
RPCResponse.prototype._predefinedErrors = null;
RPCResponse.prototype._messageID = null;
RPCResponse.prototype._alwaysCallbacks = null;
RPCResponse.prototype._rawResult = false;
RPCResponse.prototype.keyVals = null;
RPCResponse.prototype.resolved = false;
RPCResponse.prototype.result = null;

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
RPCResponse.prototype.reject = function(errorCode, errorMsg, data) {
    var errorData = data,
        errorMessage;
    if (arguments.length === 2 && typeof errorMsg === 'object') {
        errorData = errorMsg;
        errorMessage = undefined;
    } else {
        errorMessage = errorMsg;
    }
    //!= null handles null and undefined
    if (errorMessage === undefined && this._predefinedErrors != null) {
        errorMessage = this._predefinedErrors[errorCode];
    }

    debug('RPCResponse rejected with code', errorCode);
    this.resolved = true;
    this.result = respondError(errorCode, errorMessage, this._messageID, errorData);
    callAlways(this);
};
//with how early endResponse is added, this method is really useless for anything else
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
    var response = null;
    if (typeof this._httpResponse.setHeader === 'function') {
        this._httpResponse.setHeader('Content-Type', 'application/json');
    }
    if (message !== undefined) {
        if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
            response = this._rawResult ? message : JSON.stringify(message);
        } else if (message.length > 0) {
            response = message;
        }
    } else {
        response = this._rawResult ? this.result : JSON.stringify(this.result);
    }
    this._httpResponse.end(response);
}
RPCResponse.prototype.end = RPCResponseEnd;

//note: RPCResponseGroup does NOT support httpResponse being a function
function RPCResponseGroup(httpResponse) {
    this._httpResponse = httpResponse;
    this.ended = false;
    this.responses = [];
    this.results = [];
    this._resolvedCount = 0;
}
RPCResponseGroup.prototype.add = function(response, rpc) {
    var f = function(respObj, response) {
            if (!response._silent) {
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

function RPCClient(endpoint) {
    if (endpoint) {
        this.setEndpoint(endpoint);
    } else {
        this.url = null;
    }
}
RPCClient.prototype.setEndpoint = function(endpoint) {
    debug('setEndpoint', endpoint);
    this.url = url.parse(endpoint);
    if (!this.url || !this.url.host) {
        throw new TypeError('Invalid url sent to RPCClient');
    }
};
RPCClient.prototype.call = function(name, params, callback) {
    if (typeof params === 'function') {
        callback = params;
        params = null;
    }
    if (typeof callback !== 'function') {
        throw new TypeError('callback sent to RPCClient.call must be a function');
    }
    if (this.url === null) {
        throw new TypeError('RPC endpoint not defined. Must call setEndpoint or sent endpoint to constructor');
    }

    debug('call method:', name);
    var postData = JSON.stringify({
            jsonrpc: '2.0',
            method: name,
            params: params || {},
            id: Date.now()
        }),
        reqOptions = {
            hostname: this.url.hostname,
            port: this.url.port || (this.url.protocol === 'https' ? '443' : '80'),
            path: this.url.path || '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            }
        },
        resolve = function(err, res) {
            if (callback === null) {
                return;
            }
            callback(err, res);
            callback = null;
        },
        req;

    req = http.request(reqOptions, function(result) {
        debug('Received result for call', result.statusCode);
        function onClose() {
            resolve({
                type: 'http',
                statusCode: result.statusCode,
                code: RPCLib.ERROR_SERVER_ERROR,
                message: 'Server returned no body'
            }, null);
        }
        var bufferedData = null;
        result.on('data', function(data) {
            if (bufferedData === null) {
                bufferedData = data;
                return;
            }
            bufferedData = bufferConcatLimit(bufferedData, data);
        });
        result.once('end', function() {
            if (bufferedData === null) {
                onClose();
                return;
            }
            var rpcResult = null;
            try {
                rpcResult = JSON.parse(bufferedData);
                resolve(rpcResult.error || null, rpcResult.result || null);
            } catch (e) {
                debug('Error parsing json response from call', e, '\nResponse:', bufferedData.toString());
                resolve({
                    type: 'json',
                    statusCode: result.statusCode,
                    code: RPCLib.ERROR_SERVER_ERROR,
                    message: 'Server returned invalid JSON'
                }, null);
            }
        });
        result.once('close', onClose);
    });
    req.on('error', function(err) {
        resolve({
            type: 'http',
            socketError: err,
            code: 0,
            message: 'Failed to reach server'
        }, null);
    });
    req.write(postData);
    req.end();
};

RPCLib.RPCClient = RPCClient;
RPCLib.Client = RPCClient;

module.exports = RPCLib;
