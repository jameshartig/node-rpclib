var util = require('util'),
    assert = require('assert'),
    http = require('http'),
    url = require('url'),
    bufferConcatLimit = require('buffer-concat-limit'),
    log = require('levenlabs-log'),
    _EMPTY_OBJECT_ = {};

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
    if (typeof params !== 'object') {
        params = _EMPTY_OBJECT_;
    } else if (params === null) {
        params = null;
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
    log.debug('rpclib: added method', {name: name});
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
        log.debug('rpclib: removing method', {name: name});
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
    log.debug('rpclib: adding preProcessor');
    this.preProcessor = func;
};

RPCLib.prototype.handleRequest = function(requestBody, httpResponse, originalReq) {
    log.debug('rpclib: new request', {ip: originalReq ? originalReq.remoteAddress : undefined});
    var message = null,
        i = 0,
        responseGroup;
    try {
        message = JSON.parse(requestBody);
    } catch (e) {
        log.warn('rpclib: JSON error when parsing body', e);
        // continue since _processRequest will handle invalid body
    }
    if (Array.isArray(message)) {
        responseGroup = new RPCResponseGroup(httpResponse);
        for (i = 0; i < message.length; i++) {
            this._processRequest(message[i], httpResponse, responseGroup, originalReq);
        }
    } else {
        this._processRequest(message, httpResponse, null, originalReq);
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

function callHandler(handler, params, response, request, originalReq) {
    log.debug('rpclib: calling handler', {method: request.method});
    handler(params, response, originalReq);
}

RPCLib.prototype._processRequest = function(request, httpResponse, responseGroup, originalReq) {
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
        log.warn('rpclib: invalid json received');
        response.reject(RPCLib.ERROR_PARSE_ERROR);
        return;
    }

    if (request.id !== undefined) {
        response._setMessageID(request.id);
    }
    if (request.jsonrpc !== '2.0') {
        log.warn('rpclib: invalid jsonrpc value', {value: request.jsonrpc});
        response.reject(RPCLib.ERROR_INVALID_REQUEST);
        return;
    }
    if (typeof request.method !== 'string') {
        log.warn('rpclib: invalid method value', {value: request.method});
        response.reject(RPCLib.ERROR_INVALID_REQUEST);
        return;
    }
    if ((typeof request.params !== 'object' && request.params !== undefined) || request.params === null) {
        log.warn('rpclib: invalid params value', {value: request.params});
        response.reject(RPCLib.ERROR_INVALID_REQUEST);
        return;
    }

    //according to the spec we must send back something even if invalid request so move this till after
    //we verify that the request is valid, otherwise we might incorrectly think something is silent
    //when its actually an invalid request
    if (request.id === undefined) {
        response._silent = true;
    }

    methodDetail = this.methods[request.method];
    if (methodDetail === undefined) {
        log.warn('rpclib: method does not exist', {method: request.method});
        response.reject(RPCLib.ERROR_INVALID_METHOD, {method: request.method});
        return false;
    }

    //if the params are explictly null then drop all params
    if (methodDetail.params === null) {
        params = {};
    } else {
        for (k in methodDetail.params) {
            if (!methodDetail.params.hasOwnProperty(k)) {
                continue;
            }
            v = methodDetail.params[k];
            t = request.params ? typeof request.params[k] : 'undefined';
            if (v.type === 'array' && t === 'object' && Array.isArray(request.params[k])) {
                t = 'array';
            }
            if (v.type !== '*' && t !== v.type && (!v.optional || t !== 'undefined')) {
                log.warn('rpclib: method received invalid param', {method: request.method, param: k, type: t});
                response.reject(RPCLib.ERROR_INVALID_PARAMS, {param: k, expectedType: v.type, sentType: t});
                return;
            }
        }
        params = request.params;
    }

    if (methodDetail.errors !== null) {
        response._predefinedErrors = methodDetail.errors;
    }

    try {
        if (this.preProcessor !== null && methodDetail.internal !== true) {
            log.debug('rpclib: calling preProcessor', {method: request.method});
            dfd = this.preProcessor(request, response, methodDetail.flags, originalReq);
            //if they returned a dfd wait until its done before calling handler
            if (dfd && typeof dfd.then === 'function') {
                //call done so it throws if there's an error but we're not guranateed everything will support done >_<
                dfd[typeof dfd.done === 'function' ? 'done' : 'then'](function() {
                    if (response.resolved) {
                        log.debug('rpclib: preProcessor resolved response', {method: request.method});
                        return;
                    }
                    callHandler(methodDetail.handler, params, response, request, originalReq);
                });
                return;
            }
            if (response.resolved) {
                log.debug('rpclib: preProcessor resolved response', {method: request.method});
                return;
            }
        }

        callHandler(methodDetail.handler, params, response, request, originalReq);
    } catch (e) {
        log.error('rpclib: error from handler/preProcessor', {method: request.method, error: e});
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
    return {
        jsonrpc: '2.0',
        result: res !== undefined ? res : null,
        id: id
    };
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
                process.nextTick(function() {
                    httpResponse(result);
                });
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
    log.debug('rpclib: RPCResponse resolved');
    this.resolved = true;
    this.result = respondResult(result, this._messageID);
    callAlways(this);
};
RPCResponse.prototype.reject = function(errorCode, errorMsg, data) {
    var errorData = data,
        errorMessage;
    if (arguments.length === 2 && typeof errorMsg === 'object' && errorMsg !== null) {
        errorData = errorMsg;
        errorMessage = undefined;
    } else {
        errorMessage = errorMsg;
    }
    //!= null handles null and undefined
    if (errorMessage == null && this._predefinedErrors != null) {
        errorMessage = this._predefinedErrors[errorCode];
    }

    log.debug('rpclib: RPCResponse rejected', {code: errorCode});
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
    log.debug('rpclib: ending RPCResponse');
    var response = null;
    if (typeof this._httpResponse.setHeader === 'function') {
        this._httpResponse.setHeader('Content-Type', 'application/json');
    }
    if (message !== undefined) {
        if (typeof message !== 'string' && !Buffer.isBuffer(message)) {
            response = this._rawResult ? message : JSON.stringify(message);
        } else if (message !== null) {
            response = message;
        }
    } else {
        response = this._rawResult ? this.result : JSON.stringify(this.result);
    }
    try {
        this._httpResponse.end(response);
    } catch (e) {
        //this will most likely only happen when the httpResponse was already closed on the client side
        log.warn('rpclib: failed to end httpResponse', e);
    }
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

function RPCClientResult(httpReq, resolve, promise) {
    if (!httpReq || typeof httpReq.abort !== 'function') {
        throw new TypeError('Invalid httpReq sent to RPCClientResult');
    }
    if (typeof resolve !== 'function') {
        throw new TypeError('Invalid resolve sent to RPCClientResult');
    }
    if (!promise || typeof promise.then !== 'function') {
        throw new TypeError('Invalid promise sent to RPCClientResult');
    }
    this._httpReq = httpReq;
    this._resolve = resolve;
    this._promise = promise;
    this.ended = false;
    this.timer = null;
    httpReq.once('response', function() {
        this.ended = true;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }.bind(this));
}
RPCClientResult.prototype.setTimeout = function(timeout) {
    if (this.ended) {
        return this;
    }
    if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
    }
    if (timeout > 0) {
        this.timer = setTimeout(function() {
            if (this.ended) {
                this.timer = null;
                return;
            }
            log.warn('rpclib: clientResult timed out');
            this.abort();
            this._resolve({
                type: 'timeout',
                code: 0,
                message: 'Timed out waiting for response'
            }, null);
        }.bind(this), timeout);
    }
    return this;
};
RPCClientResult.prototype.abort = function() {
    log.debug('rpclib: clientResult abort');
    if (!this.ended) {
        this._httpReq.removeAllListeners('response');
        this._httpReq.abort();
        this.ended = true;
    }
    if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
    }
    return this;
};
RPCClientResult.prototype.then = function(res, cat) {
    return this._promise.then(res, cat);
};
RPCClientResult.prototype.catch = function(cat) {
    return this._promise.catch(cat);
};

function RPCClient(endpoint) {
    if (endpoint) {
        this.setEndpoint(endpoint);
    }
}
RPCClient.prototype.url = null;
RPCClient.prototype.setEndpoint = function(endpoint) {
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
    if (callback && typeof callback !== 'function') {
        throw new TypeError('callback sent to RPCClient.call must be a function');
    }
    if (this.url === null) {
        throw new TypeError('RPC endpoint not defined. Must call setEndpoint or sent endpoint to constructor');
    }

    log.debug('rpclib: client call', {method: name});
    var promiseResolve = function(res) {
            resolvedRes = res;
        },
        promiseReject = function(err) {
            rejectedErr = err;
        },
        ourResolve = function(err, res) {
            if (err) {
                promiseReject(err);
            } else {
                promiseResolve(res);
            }
            if (callback) {
                var cb = callback;
                callback = null;
                cb(err, res);
            }
        },
        clientResult = null,
        promise = new Promise(function(resolve, reject) {
            promiseResolve = resolve;
            promiseReject = reject;
            // if we already resolved before this ever ran... call
            // resolve/reject now
            if (resolvedRes !== undefined) {
                resolve(resolvedRes);
            } else if (rejectedErr !== undefined) {
                reject(rejectedErr);
            }
        }.bind(this)),
        postData = JSON.stringify({
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
                'Content-Length': Buffer.byteLength(postData)
            }
        },
        resolvedRes, rejectedErr, req;

    req = http.request(reqOptions, function(result) {
        log.debug('rpclib: client call result', {
            method: name,
            status: result.statusCode
        });
        function onClose() {
            log.warn('rpclib: client server returned no body', {method: name});
            ourResolve({
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
                rpcResult = JSON.parse(bufferedData) || {};
                //todo: verify jsonrpc version
            } catch (e) {
                log.warn('rpclib: client received invalid json', {
                    method: name,
                    error: e,
                    body: bufferedData.toString()
                });
                ourResolve({
                    type: 'json',
                    statusCode: result.statusCode,
                    code: RPCLib.ERROR_SERVER_ERROR,
                    message: 'Server returned invalid JSON'
                }, null);
                return;
            }
            ourResolve(rpcResult.error || null, rpcResult.result || null);
        });
        result.once('close', onClose);
    });
    req.on('error', function(err) {
        //if the clientResult already ended then it must be a timeout or an abort
        if (clientResult && clientResult.ended) {
            return;
        }
        log.warn('rpclib: client received error', {
            method: name,
            error: err
        });
        ourResolve({
            type: 'http',
            socketError: err,
            code: 0,
            message: 'Failed to reach server'
        }, null);
    });
    req.write(postData);
    req.end();

    clientResult = new RPCClientResult(req, ourResolve, promise);
    return clientResult;
};

RPCLib.RPCClient = RPCClient;
RPCLib.Client = RPCClient;

module.exports = RPCLib;
