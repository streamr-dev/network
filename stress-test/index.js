var webpage = require('webpage')

var NUM_CLIENTS = 100
var TEST_ADDRESS = 'http://streamr-public.s3-website-us-east-1.amazonaws.com/stress-test/'

for (var i=0;i<NUM_CLIENTS;i++) {
	var page = webpage.create();
	// page.onConsoleMessage = function(msg) {
	//   console.log(msg);
	// };
	// page.onResourceRequested = function(request) {
	//   console.log('Request ' + JSON.stringify(request, undefined, 4));
	// };
	// page.onResourceReceived = function(response) {
	//   console.log('Receive ' + JSON.stringify(response, undefined, 4));
	// };
	page.open(TEST_ADDRESS, function(status) {
	  console.log("Status: " + status);
	});
}
