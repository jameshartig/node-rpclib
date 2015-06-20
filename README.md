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
called with (params, response) when a new request is made for this method
name. `params` is the params object sent from the client. `response` is an
instance of `RPCResponse`.

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

### rpc.removeMethod(name) ###

Removes the handler for method `name`.

### rpc.setPreProcessor(func) ###

Sets the pre-processor, which is called before the handler but after the request is
validated. The `func` is sent (requestObject, response, methodFlags). `requestObject`
is the request object sent from the client. `response` is an instance of `RPCResponse`.
`methodFlags` are the flags that were defined with the method.

### rpc.handleRequest(requestBody, serverResponse) ###

Handles a request from a client. `requestBody` should the body of the request made and
`serverResponse` should be an instance of `http.ServerResponse`.

### rpc.call(method, [, params][, callback]) ###
### rpc.call(method, callback) ###

Calls a method added by `addMethod` and sends along the passed params. `callback` is
called with `result`, which is the full JSON object (containing a `result` or `error`
key) that would've been sent in response to an HTTP request.

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
var RPCClient = require('rpclib').RPCCLient;
```

### client = new RPCClient([endpoint]) ###

Creates a new RPC client instance. `endpoint` should be a url.

### client.setEndpoint(endpoint) ###

`endpoint` should be a url.

### client.call(name[, params][, callback]) ###
### client.call(name, callback) ###

Call an RPC method named `name` with `params`. `callback` will be called with `(err, result)`.
