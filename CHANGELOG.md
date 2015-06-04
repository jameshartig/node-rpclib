## Changelog ##

### 0.1.0 ###
* Fixed resolve(null) actually resolving with {}
* reject with no message defaults to message from definition

### 0.0.11 ###
* `array` type is now enforced (`object` still continue to match arrays and objects)

### 0.0.10 ###
* response.reject now accepts errorData

### 0.0.9 ###
* preProcessor can now return a promise
* Params can now be sent shorthand like: `{ name: 'string' }`
