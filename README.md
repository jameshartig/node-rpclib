# rpclib #

A simple library for building a JSON-RPC 2.0 compliant endpoint using Node.js.

### Usage ###

```JS
var RPCLib = require('rpclib');
```

## RPCLib Methods ##

### rpc = new RPCLib() ###

Creates a new RPC library instance. Should be done at application start up.

### rpc.addMethod(name, handler[, params][, flags]) ###
### rpc.addMethod(name, options) ###

Adds a new handler for method `name`. `options` should be an object that has
`handler`, `params`, and `flags`, as keys. `handler` is a callback that is
called with (params, response, httpRequest) when a new request is made for this
method name. `params` is the params object sent from the client. `response` is
an instance of `RPCResponse`. `httpRequest`, if this call originated from an
http request, will be an instance of `http.IncomingMessage`.

`params` should be a hash like this example:
```JS
{
    email: {type: 'string', optional: false},
    password: {type: 'string', optional: false},
    name: {type: 'string', optional: false},
    phone: {type: 'number', optional: true}
}
```
`flags` are completely optional and will be passed to your pre-processor(s).

If `params` is `null` (rather than an object or undefined) then the parameters
object sent to the `handler` will be an empty object, guaranteed. Normally the
passed object is validated but passed through as originally sent. This could
cause issues if you're expecting an empty object since your method accepts no
parameters but the caller sent extraneous parameters.

### rpc.removeMethod(name) ###

Removes the handler for method `name`.

### rpc.setPreProcessor(func) ###

Sets the pre-processor, which is called before the handler but after the request is
validated. The `func` is sent (requestObject, response, methodFlags, httpRequest).
`requestObject` is the request object sent from the client. `response` is an
instance of `RPCResponse`. `methodFlags` are the flags that were defined with
the method. `httpRequest`, if this call originated from an http request, will be
an instance of `http.IncomingMessage`.

### rpc.handleRequest(requestBody, serverResponse, httpRequest) ###

Handles a request from a client. `requestBody` should the body of the request made and
`serverResponse` should be an instance of `http.ServerResponse`. `httpRequest`
should be an instance of `http.IncomingMessage` if this call orginated from an
http request.

### rpc.call(method[, params][, callback][, httpRequest]) ###
### rpc.call(method, callback[, httpRequest]) ###

Calls a method added by `addMethod` and sends along the passed params. `callback` is
called with `result`, which is the full JSON object (containing a `result` or `error`
key) that would've been sent in response to an HTTP request. If this was called
in response to a HTTP request, it should be passed as `httpRequest` so methods can
get IP and other information from that request.

## RPCResponse Methods ##

### resp.resolve(result) ###

Resolves a request with the passed `result`.

### resp.reject(errorCode[, errorMessage][, errorData]) ###

Rejects a request and responds with an error object containing the passed code, message,
and data.

### resp.set(name, value) ###

Set arbitrary data on the response for later use in a post-processor, pre-processor or
handler.

### resp.get(name) ###

Get arbitrary data that was previously stored with `set`.

## Predefined Errors ##

### RPCLib.ERROR_PARSE_ERROR ###
### RPCLib.ERROR_INVALID_REQUEST ###
### RPCLib.ERROR_INVALID_METHOD ###
### RPCLib.ERROR_INVALID_PARAMS ###
### RPCLib.ERROR_INTERNAL_ERROR ###
### RPCLib.ERROR_SERVER_ERROR ###

## RPCClient Methods ##

### Usage ###

```JS
var RPCClient = require('rpclib').RPCClient;
```

### client = new RPCClient([endpoint]) ###

Creates a new RPC client instance. `endpoint` should be a url.

### client.setEndpoint(endpoint) ###

`endpoint` should be a url.

### client.call(name[, params][, callback]) ###
### client.call(name[, callback]) ###

Call an RPC method named `name` with `params`. `callback` will be called with
`(err, result)`. Returns an instance of `RPCClientResult` which can be used as a
promise but also exposes `setTimeout(timeout)`, which can be used to set the
timeout on the call, and `abort()`, which can be used to abort the request.
