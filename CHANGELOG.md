## Changelog ##

### 0.4.0 ###
* Rewritten handler in call
* Fixed promise-like RPCClientResult
* Handle catch from preProcessor

### 0.3.2 ###
* Added configuration values

### 0.3.1 ###
* Use modulelog instead of levenlabs-log
* Accept `http.IncomingMessage` in call

### 0.3.0 ###
* Return promise in client
* Switch to levenlabs-log
* Pass along original `http.IncomingMessage`

### 0.2.2 ###
* Added helpful data to the error `data` when method is invalid or params are invalid

### 0.2.1 ###
* Don't allow resolve throws to seem like a json error
* Fixed case where callback sent to `call` could be called twice

### 0.2.0 ###
* Added explicit handling of null params when adding new method

### 0.1.8 ###
* Fixed utf-8 client payloads sending wrong Content-Length

### 0.1.6 ###
* Fix "Invalid Request" response to include null ID to follow spec
* Fix "Invalid Request" being sometimes treated as silent

### 0.1.5 ###
* Call "end" function on nextTick to prevent any exceptions from bubbling into RPCResponseEnd

### 0.1.4 ###
* Added abort() to RPCClientResult

### 0.1.3 ###
* Return a RPCClientResult from client.call to expose setTimeout

### 0.1.2 ###
* Wrap httpResponse.end in try/catch in case client closed

### 0.1.1 ###
* Fixed handling of undefined `params` in request
* Added `removeMethod`
* Fixed multi-packet responses in RPCClient

### 0.1.0 ###
* Fixed resolve(null) actually resolving with `null`
* reject with no message defaults to message from definition
* Exceptions throw in handler will now correctly throw if using promise in preProcessor

### 0.0.11 ###
* `array` type is now enforced (`object` still continue to match arrays and objects)

### 0.0.10 ###
* response.reject now accepts errorData

### 0.0.9 ###
* preProcessor can now return a promise
* Params can now be sent shorthand like: `{ name: 'string' }`
