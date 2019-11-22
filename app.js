/*jslint node: true, nomen: true*/
'use strict';

var express = require('express');
var path = require('path');
var morgan = require('morgan');
// var winston = require('winston');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var fs = require('fs');
var routes = require('./routes/index');
var users = require('./routes/users');
var nodeoutlook = require('nodejs-nodemailer-outlook');
var async = require('async');
var request = require('request');

var app = express();

// set the view engine to ejs
app.set('view engine', 'ejs');

app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: false
  })
);
app.use(cookieParser());

// get config

// pretend to return favicon
app.get('/favicon.ico', function(req, res) {
  res.send(200);
});

// Set the ENV variable to point to the right environment

switch (process.env.NODE_ENV) {
  case 'development':
    app.set('env', 'development');
    break;
  case 'production':
    app.set('env', 'production');
    break;
  case 'test':
    app.set('env', 'test');
    break;
  default:
    console.error("NODE_ENV environment variable should have value 'development', 'test', or 'production' \nExiting");
    process.exit();
}

//load the config variables depending on the environment

var config_file_name = app.get('env') + '_config.json';
var data = fs.readFileSync(path.join(__dirname, 'config', config_file_name));
var myObj;
var configObject, property;
try {
  configObject = JSON.parse(data);
} catch (err) {
  console.log('There has been an error parsing the config file JSON.');
  console.log(err);
  process.exit();
}
app.config = {};
for (property in configObject) {
  if (configObject.hasOwnProperty(property)) {
    app.config[property] = configObject[property];
  }
}

// app.use('/', routes);
// app.use('/', function(req, res, next) {
//   res.render('<a href="/send-mail">SEND NEW EMAIL</a>');
// });

var getDateRangeQueryParam = function(startDate, endDate) {
  var dateRange = {
    $gt: {
      __type: 'Date',
      iso: new Date(startDate).toISOString()
    }
  };

  if (endDate) {
    var endDateParam = {
      $lt: {
        __type: 'Date',
        iso: new Date(endDate).toISOString()
      }
    };
    Object.assign(dateRange, endDateParam);
  }
  return {
    endedAt: dateRange
  };
};

// index page
app.get('/', function(req, res) {
  res.render('pages/index');
});

const formattedDate = dateObj => {
  const fDate = new Date(dateObj);
  const md = fDate.getHours() > 12 ? 'PM' : 'AM';

  const hh = fDate.getHours() % 12 < 10 ? `0${fDate.getHours() % 12}` : `${fDate.getHours() % 12}`;
  const mm = fDate.getMinutes() < 10 ? `0${fDate.getMinutes()}` : `${fDate.getMinutes()}`;

  return `${hh}:${mm} ${md}`;
};

const getUnclassifiedDrive = data => {
  const { startedAt, endedAt, googleDistance } = data;
  const startedAtStr = `${startedAt.iso}`;
  const endedAtStr = `${endedAt.iso}`;
  const formattedStartedAt = `${formattedDate(startedAtStr)}`;
  const formattedEndedAt = `${formattedDate(endedAtStr)}`;

  let distance = parseFloat(googleDistance);
  distance = distance.toFixed(2);
  return `{
		"type": "ColumnSet",
		"spacing": "Large",
		"separator": false,
		"columns": [
			{
				"type": "Column",
				"items": [
					{
						"type": "Input.Toggle",
						"id": "${data.objectId}",
						"title": "",
						"value": "false",
						"valueOn": "true",
						"valueOff": "false",
						"spacing": "extraLarge"
					}
					
				]
			},
			{
				"type": "Column",
				"items": [
					{
						"type": "TextBlock",
						"spacing": "None",
						"text": "**${data.startLocName} to ${data.endLocName}**",
						"isSubtle": true,
						"width": "auto"
					},
					{
						"type": "TextBlock",
						"spacing": "None",
						"text": "${distance} Miles, $${data.value}",
						"isSubtle": true,
						"width": "auto"
					},
					{
						"type": "TextBlock",
						"spacing": "None",
						"text": "${formattedStartedAt} - ${formattedEndedAt}",
						"isSubtle": true,
						"width": "auto"
					}
				]
			}
		]
	}`;
};

const getClassifiedDrive = data => {
  const { googleDistance } = data;

  let distance = parseFloat(googleDistance);
  distance = distance.toFixed(2);

  return `{
		"type": "ColumnSet",
		"spacing": "Large",
		"separator": true,
		"columns": [
			{
				"type": "Column",
				"items": [
					{
						"type": "TextBlock",
            "spacing": "None",
            "id": "${data.objectId}",
						"text": "**${data.startLocName} to ${data.endLocName}**",
						"isSubtle": true,
						"width": "auto"
					},
					{
						"type": "TextBlock",
						"spacing": "None",
						"text": "${distance} Miles, $${data.value}",
						"isSubtle": true,
						"width": "auto"
					},
					{
						"type": "TextBlock",
						"spacing": "None",
						"text": "${data.state == 1 ? 'Business' : 'Personal'}",
						"color": "good",
						"isSubtle": true,
						"width": "auto"
					}
				]
			}
		]
	}`;
};

const noDrive = `{
	"width": "32px"
}`;

const seperator = `,`;

const startMarkUp = `<html>
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <script type="application/adaptivecard+json">{
	"type": "AdaptiveCard",
	"padding": "none",
    "hideOriginalBody": true,
	"body": [
		{
			"type": "Container",
			"style": "emphasis",
			"items": [
				{
					"type": "ColumnSet",
					"columns": [
						
						{
							"type": "Column",
							"items": [
								{
									"type": "Image",
									"horizontalAlignment": "Right",
									"url": "https://mdl-marketing-cdn-web.azureedge.net/web/mileiq-marketing-site-2019/logos/mileiq_circular_logo_stack-gray.png",
									"height": "25px",
									"altText": "MileIQ Logo"
								}
							],
							"width": "auto"
						}
					]
				}
			]
		},
		{
			"type": "Container",
			"padding": {
				"top": "none",
				"left": "default",
				"bottom": "default",
				"right": "default"
			},
			"items": [
				{
					"type": "Container",
					"items": [
						{
							"type": "ColumnSet",
							"spacing": "Large",
							"separator": true,
							"columns": [
								{
									"type": "Column",
									"items": [
										{
											"type": "TextBlock",
											"size": "Medium",
											"text": "**Classify drives**",
											"wrap": true
										},
										{
											"type": "TextBlock",
											"spacing": "None",
											"text": "Select your drives from today and classify",
											"isSubtle": true
										}
									],
									"width": "stretch"
								}
							]
						}`;

const endMarkUp = `]
				}
			]
		},
        {
            "type": "Container",
            "padding": {
                "top": "none",
                "left": "default",
                "bottom": "default",
                "right": "default"
            },
            "items": [
                {
                    "type": "ActionSet",
                    "actions": [
                        {
                            "type": "Action.Http",
                            "method": "POST",
                            "body": "{}",
                            "title": "Business",
                            "url": "https://mdl-marketing-cdn-web.azureedge.net/web/api/HttpPost?code=zJaYHdG4dZdPK0GTymwYzpaCtcPAPec8fTvc2flJRvahwigYWg3p0A==&message=The profile was updated successfully"
                        },
                        {
                            "type": "Action.Http",
                            "method": "POST",
                            "body": "{}",
                            "title": "Personal",
                            "url": "https://mdl-marketing-cdn-web.azureedge.net/web/api/HttpPost?code=zJaYHdG4dZdPK0GTymwYzpaCtcPAPec8fTvc2flJRvahwigYWg3p0A==&message=The profile was rejected successfully"
                        }
                    ]
                }
            ]
        }
	],
	"version": "1.0"
}
  </script>
</head>
<body>
Visit the Outlook Dev Portal to learn more about Actionable Messages.
</body>
</html>`;

app.use('/send-mail', function(req, res) {
  async.waterfall(
    [
      function(callback) {
        // query parameter in drives request
        var drivesQueryJson = {
          user: {
            __type: 'Pointer',
            className: 'whocares',
            objectId: 'ro3wdmBNEemtBXIL9xzgSg'
          },
          state: {
            $in: [0, 1, 2, 10]
          }
        };

        const dateRange = getDateRangeQueryParam('2019, 11, 18', '2019, 11, 22');

        Object.assign(drivesQueryJson, dateRange);

        var qParams = {
          where: JSON.stringify(drivesQueryJson),
          limit: 5000,
          mapNamedLocations: 'True',
          order: '-endedAt'
        };

        const options = {
          url: 'https://miqapi-staging.mobiledatalabs.com/1/classes/Drive',
          qs: qParams,
          headers: {
            'Content-Type': 'application/json',
            'X-MileIQ-API-Key': '1BD272D1-3DC4-4AF4-BCC6-D125C521788C',
            'X-MileIQ-Application-Id': 'E7EC264F-F470-4C7C-95AF-4B5D08C57346',
            'X-MileIQ-Acting-On': 'ro3wdmBNEemtBXIL9xzgSg'
          }
        };

        // get drives data here and pass that to callback
        return request(options, function(error, response, body) {
          const data = JSON.parse(body).results;
          callback(null, { data });
        });
      },
      function(res, callback) {
        // build markup from data and pass this markup to send mail html
        const { data } = res;

        const markupData = data.map(el => {
          if (el.state == 0) {
            return getUnclassifiedDrive(el);
          } else if (el.state == 1 || el.state == 2) {
            return getClassifiedDrive(el);
          }
          return '';
        });

        const resData = `${startMarkUp}${seperator}${markupData.join()}${endMarkUp}`;
        // console.log(resData);

        nodeoutlook.sendEmail({
          auth: {
            user: 'admin@M365x663572.onmicrosoft.com',
            pass: 'MileIQ@Demo2019'
          },
          from: 'admin@M365x663572.onmicrosoft.com',
          to: 'admin@M365x663572.onmicrosoft.com',
          subject: 'Hey, Classify your drives!',
          html: `${resData}`,
          replyTo: 'admin@M365x663572.onmicrosoft.com',
          onError: e => {
            next(err);
            console.log(e);
          },
          onSuccess: i => {
            res.status(200).send('Email sent succesfully');
            console.log(i);
          }
        });
        callback(null, 'done');
      }
    ],
    function(err, result) {
      // result now equals 'done'
      if (err) {
        res.status(500).send('Error sending email, please try again');
      }
      //   res.status(200).send('Sending Email, Please wait');
    }
  );
});

// app.use('/send-mail', function(req, res, next) {
//   nodeoutlook.sendEmail({
//     auth: {
//       user: 'admin@M365x073908.onmicrosoft.com',
//       pass: 'MileIQ@Demo2019'
//     },
//     from: 'admin@M365x073908.onmicrosoft.com',
//     to: 'admin@M365x073908.onmicrosoft.com',
//     subject: 'Hey, Classify your drives!',
//     html: `${startMarkUp}${seperator}${unclassifiedDrive}${seperator}${classifiedDrive}${endMarkUp}`,
//     // html: `${resMarkUp}`,
//     // html: `<b>dsdsds</b>`,
//     replyTo: 'admin@M365x073908.onmicrosoft.com',
//     onError: e => {
//       next(err);
//       console.log(e);
//     },
//     onSuccess: i => {
//       res.status(200).send('Email sent succesfully');
//       console.log(i);
//     }
//   });
// });

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.json({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.json({
    message: err.message,
    error: {}
  });
});

module.exports = app;
