# OpenRCT2-research-randomizer

![License](https://img.shields.io/badge/license-MIT-green)

## 📝 Description

Spice up your classic OpenRCT2 scenarios with the research-randomizer plugin! This plugin introduces an element of surprise by randomizing the research progression and starting technologies, offering a fresh and unpredictable assortment of rides and stalls each time you play. Rediscover old favorites and adapt your park strategy to the ever-changing availability of attractions.

## ⚙️ Using the plugin

Just pick how many total technologies you want available over the course of the game (anywhere from 1x, which is unchanged from the default numbers, up to 3x, which triples the total list of technolgies you can unlock unless you run out of new rides to research!) and select if you want to be guaranteed to start with the Cash Machine, Info Kiosk, or First Aid Room unlocked immediately or researchable (or to receive no special handling).

Then just click the "Randomize Research" button to shuffle things up!

Anything already built in the park will be guaranteed to stay researched, but everything else is fair game to be shuffled.

Feel free to hit the button multiple times if you're unhappy with the first spin of the wheel.

You will need to advance by at least one in-game day per randomization, to make sure all the changes implement properly.

## Changelog

V1.0

- initial commit

V2.0

- added the ability to filter out Custom items (since there are a lot of decorative rides and such)
- massive overhaul to basically the whole plugin under-the-hood, but feature set is still basically unchanged
- still have persistent issues filtering out extraneous ride variants when using research multiplier

V3.0

- added "Even item distribution" mode, which averages the number of items per category
- added First Aid Room special handeling
- added ability to Guarantee (i.e. have on the research list) or Start with (i.e. be immediately buildable) the special items
- added a seed for more reproducability
- removed Smart Scan requirement
- total stability and consistency overhaul. Finally stopped the filtering issue.

## 📜 License

This project is licensed under the MIT License.
