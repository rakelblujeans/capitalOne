
Github: https://github.com/rakelblujeans/capitalOne

A few small notes:

* It looks like npm-shrinkwrap does not support Node v3 and higher, so I was not able to use it.
  Also, it seems unecessary. I locked the versions down directly in my package.jsonn without needing
  to depend on an external module. For details: https://github.com/uber/npm-shrinkwrap

* I switched to ES6 and included the babel dependencies here. My code could be more fully optimized
  to take advantage of ES6 features, but I'm running low on time here.

A few caveats:

* I have not included any tests

* I have chosen not to sanitize incoming data, although in a production environment that would be a
  top concern for me. I've chosen to ignore security issues like this for now, given the time
  constraints.

* This is the first project I've done in Express/Node. I'm sure the code could be better organized!
  In general, I placed the routes first in each file since they help you get a sense of what's going
  on overall within that module. Next is any middleware code, followed by function I would consider
  to be more private.

