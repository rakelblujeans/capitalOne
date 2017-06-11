A few small notes:

It looks like npm-shrinkwrap does not support Node v3 and higher, so I was not able to use it. Also,
it seems unecessary. I locked the versions down directly in my package.jsonn without needing to
depend on an external module. For details: https://github.com/uber/npm-shrinkwrap

I switched to ES6 and included the babel dependencies here. My code could be more fully optimized
to take advantage of ES6 features, but I'm running low on time here.

Github: https://github.com/rakelblujeans/capitalOne
