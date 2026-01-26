export function getDefaultComponents() {
	const components = {
		"NPN transistor_copy": {
			"name": "NPN Transistor",
			"description": "",
			"defaultValue": "",
			"designator": {
				"prefix": "Q",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"models": [
				{
					"name": "2N3904",
					"model": ".model 2N3904 NPN(IS=1.26532e-14 BF=206.302 NF=1.5 VAF=1000\n+ IKF=0.0272221 ISE=2.30771e-14 NE=3.31052 BR=20.6302\n+ NR=2.89609 VAR=24.7131 IKR=0.272221 ISC=2.30771e-14\n+ NC=1.9876 RB=5.8376 IRB=50.3624 RBM=0.634251 RE=0.0001\n+ RC=2.65711 XTB=0.1 XTI=1 EG=1.05 CJE=4.64214e-12\n+ VJE=0.4 MJE=0.256227 TF=4.19578e-10 XTF=0.906167\n+ VTF=8.75418 ITF=0.0105823 CJC=3.76961e-12 VJC=0.4\n+ MJC=0.238109 XCJC=0.8 FC=0.512134 CJS=0 VJS=0.75\n+ MJS=0.5 TR=6.82023e-08 PTF=0 KF=0 AF=1)"
				},
				{
					"name": "2N2222",
					"model": ".model 2N2222 NPN(IS=3.295e-14 BF=255.9 NF=1.307 VAF=75\n+ IKF=0.3 ISE=3.295e-14 NE=2 BR=7.546 NR=1.007 VAR=24\n+ IKR=0.0035 ISC=2.818e-13 NC=1.24 RB=0.56 IRB=0.1\n+ RBM=0.1 RE=0.13 RC=0.87 CJE=2.441e-11 VJE=0.75\n+ MJE=0.2762 TF=4.881e-10 XTF=40 VTF=1.7 ITF=0.35\n+ CJC=9.207e-12 VJC=0.75 MJC=0.3147 XCJC=0.6193 FC=0.8\n+ CJS=0 VJS=0.75 MJS=0.5 TR=8.533e-08 XTB=1.5 KF=0 AF=1)"
				}
			],
			"pins": [
				{
					"id": "1",
					"name": "C",
					"position": {
						"x": 30,
						"y": -0.3333333333333333
					},
					"labelPosition": {
						"x": 35,
						"y": -1
					}
				},
				{
					"id": "2",
					"name": "B",
					"position": {
						"x": -1.1934897514720433e-15,
						"y": 20
					},
					"labelPosition": {
						"x": -2,
						"y": 14
					}
				},
				{
					"id": "3",
					"name": "E",
					"position": {
						"x": 30,
						"y": 40.333333333333336
					},
					"labelPosition": {
						"x": 36,
						"y": 40
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 15,
						"y": 48
					},
					{
						"x": 49,
						"y": 17
					}
				],
				"value": [
					{
						"x": 10,
						"y": 56
					},
					{
						"x": 44,
						"y": 25
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25 30 L 10 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 26 21 L 26 39\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 27 L 40 20\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 34 L 40 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 40 20 L 40 10\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 40 40 L 40 50\"/><circle cx=\"32\" cy=\"30\" r=\"14\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\"/><polygon points=\"39,39 36,36 35,38 34,39\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/></svg>",
			"componentType": "primitive"
		},
		"PNP transistor": {
			"name": "PNP Transistor",
			"description": "",
			"defaultValue": "",
			"designator": {
				"prefix": "Q",
				"autoIncrement": true
			},
			"size": {
				"width": 40,
				"height": 40
			},
			"models": [
				{
					"name": "2N3904",
					"model": ".model 2N3904 NPN(IS=1.26532e-14 BF=206.302 NF=1.5 VAF=1000\n+ IKF=0.0272221 ISE=2.30771e-14 NE=3.31052 BR=20.6302\n+ NR=2.89609 VAR=24.7131 IKR=0.272221 ISC=2.30771e-14\n+ NC=1.9876 RB=5.8376 IRB=50.3624 RBM=0.634251 RE=0.0001\n+ RC=2.65711 XTB=0.1 XTI=1 EG=1.05 CJE=4.64214e-12\n+ VJE=0.4 MJE=0.256227 TF=4.19578e-10 XTF=0.906167\n+ VTF=8.75418 ITF=0.0105823 CJC=3.76961e-12 VJC=0.4\n+ MJC=0.238109 XCJC=0.8 FC=0.512134 CJS=0 VJS=0.75\n+ MJS=0.5 TR=6.82023e-08 PTF=0 KF=0 AF=1)"
				},
				{
					"name": "2N2222",
					"model": ".model 2N2222 NPN(IS=3.295e-14 BF=255.9 NF=1.307 VAF=75\n+ IKF=0.3 ISE=3.295e-14 NE=2 BR=7.546 NR=1.007 VAR=24\n+ IKR=0.0035 ISC=2.818e-13 NC=1.24 RB=0.56 IRB=0.1\n+ RBM=0.1 RE=0.13 RC=0.87 CJE=2.441e-11 VJE=0.75\n+ MJE=0.2762 TF=4.881e-10 XTF=40 VTF=1.7 ITF=0.35\n+ CJC=9.207e-12 VJC=0.75 MJC=0.3147 XCJC=0.6193 FC=0.8\n+ CJS=0 VJS=0.75 MJS=0.5 TR=8.533e-08 XTB=1.5 KF=0 AF=1)"
				}
			],
			"pins": [
				{
					"id": "1",
					"name": "B",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": 0,
						"y": 17
					}
				},
				{
					"id": "2",
					"name": "E",
					"position": {
						"x": 30,
						"y": 0
					},
					"labelPosition": {
						"x": 37,
						"y": 0
					}
				},
				{
					"id": "3",
					"name": "C",
					"position": {
						"x": 30,
						"y": 40
					},
					"labelPosition": {
						"x": 37,
						"y": 40
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 15,
						"y": 48
					},
					{
						"x": 49,
						"y": 17
					}
				],
				"value": [
					{
						"x": 10,
						"y": 56
					},
					{
						"x": 44,
						"y": 25
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25 30 L 10 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 26 21 L 26 39\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 27 L 40 20\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 34 L 40 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 40 20 L 40 10\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 40 40 L 40 50\"/><circle cx=\"32\" cy=\"30\" r=\"14\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\"/><polygon points=\"29,35 34,35 32,38 32,38\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/></svg>",
			"componentType": "primitive"
		},
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 19 30 L 10 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 41 30 L 49 30\"/><path data-arc=\"true\" data-cx=\"20\" data-cy=\"16\" data-r=\"4\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 30 22 A 4 4 0 0 1 30 30\"/><path data-arc=\"true\" data-cx=\"20\" data-cy=\"24\" data-r=\"4\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 30 38 A 4 4 0 0 1 30 30\"/><circle cx=\"30\" cy=\"30\" r=\"11\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\"/></svg>",
			"models": [],
			"componentType": "primitive"
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 34 24 L 34 36\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 30 L 10 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 35 30 L 50 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 19 25 L 19 20\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 40 22 L 46 22\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 43 19 L 43 25\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"3\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 27 20 L 27 40\"/></svg>",
			"models": [],
			"componentType": "primitive"
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 30 L 25 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25 20 L 25 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 36 20 L 36 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 37 30 L 49 30\"/></svg>",
			"models": [],
			"componentType": "primitive"
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 30 L 24 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 33 20 L 33 40\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 34 30 L 50 30\"/><path data-arc=\"true\" data-cx=\"-2\" data-cy=\"20\" data-r=\"18\" data-start=\"-0.5880026035475675\" data-end=\"0.5880026035475675\" fill=\"none\" stroke=\"#000000\" stroke-width=\"4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 22.976905298081185 20.015396467945877 A 18 18 0 0 1 22.976905298081185 39.98460353205412\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 42 17 L 42 23\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 39 20 L 45 20\"/></svg>",
			"models": [],
			"componentType": "primitive"
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 49 30 L 42 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 19 30 L 11 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 22 30 L 28 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25 27 L 25 33\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 37 27 L 37 33\"/><circle cx=\"30\" cy=\"30\" r=\"11\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\"/></svg>",
			"models": [],
			"componentType": "primitive"
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
			"models": [
				{
					"name": "1N4148",
					"model": ".model 1N4148 D(IS=2.52n RS=0.568 N=1.752 BV=100 IBV=5u CJO=4p VJ=0.75 M=0.33 TT=11.54n)"
				},
				{
					"name": "1N914",
					"model": ".model 1N914 D(IS=2.52n RS=0.568 N=1.752 BV=100 IBV=5u CJO=4p VJ=0.75 M=0.33 TT=11.54n)"
				},
				{
					"name": "1N4007",
					"model": ".model 1N4007 D(IS=76.9n RS=42.0m BV=1000 IBV=5.00u CJO=26.5p M=0.333 N=1.45 TT=4.32u)"
				},
				{
					"name": "1N4001",
					"model": ".model 1N4001 D(IS=76.9n RS=42.0m BV=50 IBV=5.00u CJO=26.5p M=0.333 N=1.45 TT=4.32u)"
				},
				{
					"name": "1N5819",
					"model": ".model 1N5819 D(IS=31.7u RS=51.0m BV=40 IBV=1.00m CJO=110p M=0.333 N=1.41 TT=5.72n)"
				}
			],
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 45 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"30\" data-comp-height=\"40\" data-offset-x=\"8\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 33 30 L 8 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 13 30 L 38 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 25 L 28 35\"/><polygon points=\"18,25 28,30 18,35 18,35\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/></svg>",
			"componentType": "primitive"
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
			"isGround": true,
			"models": [],
			"componentType": "primitive"
		},
		"led": {
			"name": "LED",
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
			"models": [
				{
					"name": "RED_LED",
					"model": ".model RED_LED D(IS=93.2p RS=42m N=3.73 BV=4 IBV=10u CJO=2.97p VJ=0.75 M=0.333 TT=4.32u)"
				},
				{
					"name": "GREEN_LED",
					"model": ".model GREEN_LED D(IS=93.2p RS=42m N=4.0 BV=4 IBV=10u CJO=2.97p VJ=0.75 M=0.333 TT=4.32u)"
				},
				{
					"name": "BLUE_LED",
					"model": ".model BLUE_LED D(IS=93.2p RS=42m N=4.5 BV=5 IBV=10u CJO=2.97p VJ=0.75 M=0.333 TT=4.32u)"
				}
			],
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
						"x": 11,
						"y": 31
					},
					{
						"x": 29,
						"y": 13
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 45 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"30\" data-comp-height=\"40\" data-offset-x=\"8\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 33 30 L 8 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 13 30 L 38 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 25 L 28 35\"/><polygon points=\"18,25 28,30 18,35 18,35\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20.15 23.35 L 23 19\"/><polygon points=\"21,20 23.05,21.35 23.65,18.25 21,20 21,20\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/><polygon points=\"26.95,23.35 24.85,22.15 27.55,20.15 27,23 27,23\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 25.95 22.75 L 24.25 25.45\"/></svg>",
			"componentType": "primitive"
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 60 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"40\" data-comp-height=\"40\" data-offset-x=\"10\" data-offset-y=\"10\"><polyline points=\"10,30 15,30 17,24 22,36 27,24 32,36 36,24 41,36 43,30 45,30 50,30\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg>",
			"models": [],
			"componentType": "primitive"
		},
		"transformer": {
			"name": "Transformer",
			"description": "",
			"componentType": "subcircuit",
			"defaultValue": "",
			"designator": {
				"prefix": "X",
				"autoIncrement": true
			},
			"size": {
				"width": 20,
				"height": 20
			},
			"models": [],
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0,
						"y": 0
					},
					"labelPosition": {
						"x": -1,
						"y": 4
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": -1,
						"y": 17
					}
				},
				{
					"id": "3",
					"name": "3",
					"position": {
						"x": 20,
						"y": 0
					},
					"labelPosition": {
						"x": 19,
						"y": 4
					}
				},
				{
					"id": "4",
					"name": "4",
					"position": {
						"x": 20,
						"y": 20
					},
					"labelPosition": {
						"x": 19,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 40,
						"y": -12
					},
					{
						"x": -12,
						"y": 20
					}
				],
				"value": [
					{
						"x": 40,
						"y": 52
					},
					{
						"x": 92,
						"y": 20
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 30 30\" data-generated-by=\"symbol-editor\" data-comp-width=\"20\" data-comp-height=\"20\" data-offset-x=\"5\" data-offset-y=\"5\"><path data-arc=\"true\" data-cx=\"5\" data-cy=\"4\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 7 A 2 2 0 0 1 10 11\"/><path data-arc=\"true\" data-cx=\"5\" data-cy=\"8\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 11 A 2 2 0 0 1 10 15\"/><path data-arc=\"true\" data-cx=\"5\" data-cy=\"12\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 15 A 2 2 0 0 1 10 19\"/><path data-arc=\"true\" data-cx=\"5\" data-cy=\"16\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 19 A 2 2 0 0 1 10 23\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 14 7 L 14 23\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 16 7 L 16 23\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"4\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 11 A 2 2 0 0 1 20 7\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"8\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 15 A 2 2 0 0 1 20 11\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"12\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 19 A 2 2 0 0 1 20 15\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"16\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 23 A 2 2 0 0 1 20 19\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 7 L 25 5\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 23 L 25 25\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 7 L 5 5\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 23 L 5 25\"/></svg>",
			"subcircuit": {
				"name": "XFMR_SINGLE",
				"definition": ".subckt XFMR_SINGLE p1 p2 s1 s2 ratio=1\nL1 p1 p2 {100m*ratio*ratio}\nL2 s1 s2 100m\nK1 L1 L2 0.99\n.ends"
			}
		},
		"transformer_center_tap": {
			"name": "Transformer Center Tapped",
			"description": "",
			"componentType": "subcircuit",
			"defaultValue": "V=0",
			"designator": {
				"prefix": "X",
				"autoIncrement": true
			},
			"size": {
				"width": 20,
				"height": 20
			},
			"models": [],
			"pins": [
				{
					"id": "1",
					"name": "1",
					"position": {
						"x": 0,
						"y": 0
					},
					"labelPosition": {
						"x": -1,
						"y": 4
					}
				},
				{
					"id": "2",
					"name": "2",
					"position": {
						"x": 0,
						"y": 20
					},
					"labelPosition": {
						"x": -1,
						"y": 17
					}
				},
				{
					"id": "3",
					"name": "3",
					"position": {
						"x": 20,
						"y": 0
					},
					"labelPosition": {
						"x": 20,
						"y": 4
					}
				},
				{
					"id": "4",
					"name": "4",
					"position": {
						"x": 20,
						"y": 10
					},
					"labelPosition": {
						"x": 22,
						"y": 9
					}
				},
				{
					"id": "5",
					"name": "5",
					"position": {
						"x": 20,
						"y": 20
					},
					"labelPosition": {
						"x": 20,
						"y": 17
					}
				}
			],
			"labels": {
				"designator": [
					{
						"x": 40,
						"y": -12
					},
					{
						"x": -12,
						"y": 20
					}
				],
				"value": [
					{
						"x": 40,
						"y": 52
					},
					{
						"x": 92,
						"y": 20
					}
				]
			},
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 30 30\" data-generated-by=\"symbol-editor\" data-comp-width=\"20\" data-comp-height=\"20\" data-offset-x=\"5\" data-offset-y=\"5\"><path data-arc=\"true\" data-cx=\"5\" data-cy=\"4\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 7 A 2 2 0 0 1 10 11\"/><path data-arc=\"true\" data-cx=\"5\" data-cy=\"8\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 11 A 2 2 0 0 1 10 15\"/><path data-arc=\"true\" data-cx=\"5\" data-cy=\"12\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 15 A 2 2 0 0 1 10 19\"/><path data-arc=\"true\" data-cx=\"5\" data-cy=\"16\" data-r=\"2\" data-start=\"-1.5707963267948966\" data-end=\"1.5707963267948966\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 19 A 2 2 0 0 1 10 23\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 14 7 L 14 23\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 16 7 L 16 23\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"4\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 11 A 2 2 0 0 1 20 7\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"8\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 15 A 2 2 0 0 1 20 11\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"12\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 19 A 2 2 0 0 1 20 15\"/><path data-arc=\"true\" data-cx=\"15\" data-cy=\"16\" data-r=\"2\" data-start=\"1.5707963267948966\" data-end=\"4.71238898038469\" fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 23 A 2 2 0 0 1 20 19\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 7 L 25 5\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 23 L 25 25\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 7 L 5 5\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 10 23 L 5 25\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 20 15 L 25 15\"/></svg>",
			"subcircuit": {
				"name": "XFMR_CENTER_TAP",
				"definition": ".subckt XFMR_CENTER_TAP"
			}
		},
		"zener": {
			"name": "Zener",
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
			"models": [
				{
					"name": "1N4733",
					"model": ".model 1N4733 D(IS=1.1n RS=5.6 BV=5.1 IBV=27m CJO=180p M=0.333 N=1.0 TT=50n)"
				},
				{
					"name": "1N4728",
					"model": ".model 1N4728 D(IS=1.1n RS=5.6 BV=3.3 IBV=27m CJO=180p M=0.333 N=1.0 TT=50n)"
				},
				{
					"name": "1N4742",
					"model": ".model 1N4742 D(IS=1.1n RS=5.6 BV=12 IBV=27m CJO=180p M=0.333 N=1.0 TT=50n)"
				}
			],
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
			"svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 45 60\" data-generated-by=\"symbol-editor\" data-comp-width=\"30\" data-comp-height=\"40\" data-offset-x=\"8\" data-offset-y=\"10\"><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 33 30 L 8 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 30 L 38 30\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 27 L 28 33\"/><polygon points=\"18,25 28,30 18,35 18,35\" fill=\"#000000\" stroke=\"#000000\" stroke-width=\"1\" stroke-linejoin=\"round\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 27 L 26 25\"/><path fill=\"none\" stroke=\"#000000\" stroke-width=\"1\" stroke-linecap=\"round\" stroke-linejoin=\"round\" d=\"M 28 33 L 30 35\"/></svg>",
			"componentType": "primitive"
		}
	}
	return components;
}

export const DEFAULT_COMPONENT_LIBRARY = getDefaultComponents();
