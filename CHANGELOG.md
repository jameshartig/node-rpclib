## Changelog ##

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
