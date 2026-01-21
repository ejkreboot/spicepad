export function getDefaultComponents() {
	return {
		"ac_voltage": {
			"name": "AC Voltage",
			"description": "",
			"defaultValue": "AC 1",
			"designator": {
				"prefix": "V",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 1,
						"y": 17
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 39,
						"y": 20
					},
					"labelPosition": {
						"x": 36,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 20,
						"y": 3
					},
					{
						"x": 37,
						"y": 17
					}
				],
				"value": [
					{
						"x": 20,
						"y": 38
					},
					{
						"x": 42,
						"y": 25
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 19 30 L 10 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 41 30 L 49 30\"/><path data-arc=\"true\" data-cx=\"20\" data-cy=\"16\" data-r=\"4\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 30 22 A 4 4 0 0 1 30 30\"/><path data-arc=\"true\" data-cx=\"20\" data-cy=\"24\" data-r=\"4\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 30 38 A 4 4 0 0 1 30 30\"/><circle cx=\"30\" cy=\"30\" r=\"11\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\"/></svg>"
		},
		"battery": {
			"name": "Battery",
			"description": "",
			"defaultValue": "DC 5",
			"designator": {
				"prefix": "V",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 1,
						"y": 17
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 40,
						"y": 20
					},
					"labelPosition": {
						"x": 38,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 19,
						"y": 3
					},
					{
						"x": 38,
						"y": 15
					}
				],
				"value": [
					{
						"x": 21,
						"y": 38
					},
					{
						"x": 44,
						"y": 25
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 34 24 L 34 36\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 30 L 10 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 35 30 L 50 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 19 25 L 19 20\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 40 22 L 46 22\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 43 19 L 43 25\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 20 L 27 40\"/></svg>"
		},
		"capacitor": {
			"name": "Capacitor",
			"description": "",
			"defaultValue": "1uF",
			"designator": {
				"prefix": "C",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "A",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 2,
						"y": 17
					}
				},
				{
					"id": "2",
					"name": "B",
					"position": {
						"x": 39,
						"y": 20
					},
					"labelPosition": {
						"x": 36,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 20,
						"y": 3
					},
					{
						"x": 41,
						"y": 16
					}
				],
				"value": [
					{
						"x": 20,
						"y": 39
					},
					{
						"x": 44,
						"y": 26
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 30 L 25 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25 20 L 25 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 36 20 L 36 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 37 30 L 49 30\"/></svg>"
		},
		"capacitor_polarized": {
			"name": "Polarized Capacitor",
			"description": "",
			"defaultValue": "1uF",
			"designator": {
				"prefix": "C",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 2,
						"y": 17
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 40,
						"y": 20
					},
					"labelPosition": {
						"x": 36,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 18,
						"y": 2
					},
					{
						"x": 39,
						"y": 14
					}
				],
				"value": [
					{
						"x": 19,
						"y": 39
					},
					{
						"x": 43,
						"y": 23
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 30 L 24 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 33 20 L 33 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 34 30 L 50 30\"/><path data-arc=\"true\" data-cx=\"-2\" data-cy=\"20\" data-r=\"18\" data-start=\"-0.5880026035475675\" data-end=\"0.5880026035475675\" fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 22.976905298081185 20.015396467945877 A 18 18 0 0 1 22.976905298081185 39.98460353205412\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 42 17 L 42 23\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 39 20 L 45 20\"/></svg>"
		},
		"dc-voltage": {
			"name": "DC Voltage",
			"description": "",
			"defaultValue": "DC 5",
			"designator": {
				"prefix": "V",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0.7034482758620673,
						"y": 19.93103448275862
					},
					"labelPosition": {
						"x": 1,
						"y": 17
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 39,
						"y": 20
					},
					"labelPosition": {
						"x": 37,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 19,
						"y": 4
					},
					{
						"x": 36,
						"y": 14
					}
				],
				"value": [
					{
						"x": 20,
						"y": 37
					},
					{
						"x": 41,
						"y": 23
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 49 30 L 42 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 19 30 L 11 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 22 30 L 28 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25 27 L 25 33\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 37 27 L 37 33\"/><circle cx=\"30\" cy=\"30\" r=\"11\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\"/></svg>"
		},
		"diode": {
			"name": "Diode",
			"description": "",
			"defaultValue": "",
			"designator": {
				"prefix": "D",
				"autoIncrement": true
			},
			"size": {
				"width": 30,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 2,
						"y": 16
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 30,
						"y": 20
					},
					"labelPosition": {
						"x": 26,
						"y": 16
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 14,
						"y": 7
					},
					{
						"x": 28,
						"y": 19
					}
				],
				"value": [
					{
						"x": 30,
						"y": 35
					},
					{
						"x": 46,
						"y": 19
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 45 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"30\" data-comp-height=\"40\" data-offset-x=\"8\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 33 30 L 8 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 13 30 L 38 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 25 L 28 35\"/><polygon points=\"18,25 28,30 18,35 18,35\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/></svg>"
		},
		"ground": {
			"name": "Ground",
			"description": "",
			"defaultValue": null,
			"designator": {
				"prefix": "GND",
				"autoIncrement": false
			},
			"size": {
				"width": 40,
				"height": 20
			},
			"pins": [
				{
					"id": "1",
					"name": "GND",
					"position": {
						"x": 20,
						"y": 0
					},
					"labelPosition": {
						"x": 27,
						"y": 4
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 30,
						"y": 25
					},
					{
						"x": 21,
						"y": 30
					}
				],
				"value": [
					{
						"x": 30,
						"y": 18
					},
					{
						"x": 21,
						"y": 23
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 30\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"20\" data-offset-x=\"10\" data-offset-y=\"5\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 30 5 L 30 14\"/><polygon points=\"23,14 37,14 30,23 30,23\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/></svg>",
			"isGround": true
		},
		"resistor": {
			"name": "Resistor",
			"description": "",
			"defaultValue": "1k",
			"designator": {
				"prefix": "R",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"pins": [
				{
					"id": "1",
					"name": "A",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 0,
						"y": 15
					}
				},
				{
					"id": "2",
					"name": "B",
					"position": {
						"x": 40,
						"y": 20
					},
					"labelPosition": {
						"x": 35,
						"y": 15
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 19,
						"y": 7
					},
					{
						"x": 34,
						"y": 15
					}
				],
				"value": [
					{
						"x": 21,
						"y": 35
					},
					{
						"x": 35,
						"y": 23
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><polyline points=\"10,30 15,30 17,24 22,36 27,24 32,36 36,24 41,36 43,30 45,30 50,30\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>"
		}
	}
}

export const DEFAULT_COMPONENT_LIBRARY = getDefaultComponents();
