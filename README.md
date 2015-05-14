# rpclib #

A simple library for building a JSON-RPC 2.0 compliant endpoint using Node.js.

### Usage ###

```JS
var RPCLib = require('rpclib');
```

## RPCLib Methods ##

### rpc = new RPCLib() ###

Creates a new RPC library instance. Should be done at application start up.

### rpc.addMethod(name, handler[, params][, flags] ###

Adds a new handler for a method name. `handler` is a callback that is sent (requestObject, response) is
called when a new request is made for this method. `params` should be a hash like this example:
```JS
{
    email: {type: 'string', optional: false},
    password: {type: 'string', optional: false},
    name: {type: 'string', optional: false},
    phoneNumber: {type: 'string', optional: true}
}
```
`flags` are completely optional and will be passed to your pre-processor(s).

### rpc.setPreProcessor(func) ###

Sets the pre-processor, which is called before the handler but after the request is validated.
The `func` is sent (requestObject, response, methodFlags). `reqObj` is the request object sent from the client.
`response` is an instance of `RPCResponse`. `methodFlags` are the flags that were defined with the method.

### rpc.handleRequest(requestBody, serverResponse) ###

Handles a request from a client. `requestBody` should the body of the request made and
`serverResponse` should be an instance of `http.ServerResponse`.

### RPCResponse Methods ###

### resp.resolve(result) ###

Resolves a request with the passed `result`.

### resp.reject(errorCode[, errorMessage]) ###

Rejects a request and responds with an error object containing the passed code and message.
