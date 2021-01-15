import { expect } from 'chai';
import { spec } from '../../../modules/cochauxBidAdapter.js';

describe('Cochaux Adapter', () => {
  describe('All needed functions exist', () => {
    it(`isBidRequestValid is a function`, () => {
      expect(spec.isBidRequestValid).to.be.a('function');
    });

    it(`buildRequests is a function`, () => {
      expect(spec.buildRequests).to.be.a('function');
    });

    it(`interpretResponse is a function`, () => {
      expect(spec.interpretResponse).to.be.a('function');
    });

    it(`onTimeout is a function`, () => {
      expect(spec.onTimeout).to.be.a('function');
    });

    it(`onBidWon is a function`, () => {
      expect(spec.onBidWon).to.be.a('function');
    });
  });

  describe(`check spec properties`, () => {
    it(`code should equal chx`, () => {
      expect(spec.code).to.be.equal('chx');
    });
  });

  describe(`isBidRequestValid`, () => {
    describe(`given a valid bid`, () => {
      it(`should return true`, () => {
        let bid = {
          params: { placementId: 123 },
          mediaTypes: {
            banner: {
              sizes: [
                [300, 250],
                [300, 250],
              ],
            },
          },
        };
        expect(spec.isBidRequestValid(bid)).to.be.equal(true);
      });
    });

    describe(`given a bid missing a placementId`, () => {
      it(`should return false`, () => {
        let bid = {
          params: {},
          mediaTypes: { banner: { sizes: [[300, 250]] } },
        };
        expect(spec.isBidRequestValid(bid)).to.be.equal(false);
      });
    });

    describe(`given a bid missing a sizes`, () => {
      it(`should return false`, () => {
        let bid = {
          params: { placementId: 123 },
          mediaTypes: { banner: { sizes: [] } },
        };
        expect(spec.isBidRequestValid(bid)).to.be.equal(false);
      });
    });
  });

  describe(`buildRequests`, () => {
    describe(`given one valid bid`, () => {
      it(`should return a request`, () => {
        let bidRequest = [
          {
            bidId: 123,
            params: {
              placementId: 456,
              publisher: 'Publisher',
              domain: 'example.com',
            },
            sizes: [[300, 250]],
          },
        ];

        let request = spec.buildRequests(bidRequest);

        expect(request.method).to.be.equal('POST');
        expect(request.url).to.be.equal('https://demo.arrepiblik.com/dmx2');
        expect(request.data).to.be.a('string');
      });
    });

    describe(`given one valid bid missing some parameters`, () => {
      it(`should still return a request`, () => {
        let bidRequest = [
          {
            bidId: 123,
            params: { placementId: 456 },
            sizes: [[300, 250]],
          },
        ];

        let request = spec.buildRequests(bidRequest);

        expect(request.method).to.be.equal('POST');
        expect(request.url).to.be.equal('https://demo.arrepiblik.com/dmx2');
        expect(request.data).to.be.a('string');
      });
    });
  });

  describe(`interpretResponse`, () => {
    describe(`given valid bids`, () => {
      let body = {
        id: 'a45f4860-5ef0-4c5a-97a6-b681f3cc9013',
        cur: 'USD',
        seatbid: [
          {
            bid: [
              {
                id: '25318d3372e5ad',
                impid: '25318d3372e5ad',
                dealid: 'dmx-deal-hp-24',
                price: 12,
                adm: '</some ad>',
                crid: '7735717532',
                w: 300,
                h: 250,
              },
              {
                id: '25318d3372e5ad',
                impid: '25318d3372e5ad',
                dealid: 'dmx-deal-hp-25',
                price: 11,
                adm: '</some ad>',
                crid: '8256455784',
                w: 300,
                h: 50,
              },
            ],
          },
          {
            bid: [
              {
                id: '3e750a7a448aca',
                impid: '3e750a7a448aca',
                dealid: 'dmx-deal-hp-24',
                price: 13,
                adm: '</some ad>',
                crid: '5873172665',
                w: 970,
                h: 250,
              },
              {
                id: '3e750a7a448aca',
                impid: '3e750a7a448aca',
                dealid: 'dmx-deal-hp-25',
                price: 14,
                adm: '</some ad>',
                crid: '6493995138',
                w: 500,
                h: 250,
              },
            ],
          },
        ],
      };

      it(`should return the winning bids`, () => {
        let wins = spec.interpretResponse({ body });

        expect(wins.length).to.be.equal(2);
        expect(wins[0].id).to.be.a('string');
        expect(wins[0].price).to.equal(12);
        expect(wins[1].id).to.be.a('string');
        expect(wins[1].price).to.equal(14);
      });
    });

    describe(`given an empty body`, () => {
      it(`should not return any winning bid`, () => {
        let wins = spec.interpretResponse({});

        expect(wins.length).to.be.equal(0);
      });
    });
  });
});
