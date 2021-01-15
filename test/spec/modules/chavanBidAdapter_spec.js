import { assert, expect } from 'chai';
import { spec } from 'modules/chavanBidAdapter.js';

describe('chavanBidAdapter ', function () {
  describe('Test isBidRequestValid', function () {
    let bid;
    beforeEach(function () {
      bid = {
        sizes: [300, 250],
        params: {
          placementId: '1234'
        }
      };
    });

    it('should return false when params is missing or null', function () {
      assert.isFalse(spec.isBidRequestValid({ params: null }));
      assert.isFalse(spec.isBidRequestValid({}));
      assert.isFalse(spec.isBidRequestValid(null));
    });

    it('should return true when placementId is present on the params object', function () {
      assert(spec.isBidRequestValid(bid));
    });

    it('should return false when placementId is missing', function () {
      delete bid.params.placementId;
      assert.isFalse(spec.isBidRequestValid(bid));
    });
  });

  describe('Test buildRequests', function () {
    let validBidRequest = {
      bidId: 'bid1234',
      sizes: [[300, 250], [300, 600]],
      params: {
        placementId: '1234'
      }
    };

    let bidderRequest = {
      auctionId: 'qwerty12345',
      refererInfo: {
        referer: 'https://abc.com/xyz'
      }
    };

    let expectedDataImp = {
      banner: {
        format: [
          {
            h: 250,
            w: 300
          },
          {
            h: 600,
            w: 300
          }
        ],
        pos: 0
      },
      id: 'bid1234',
      tagid: '1234'
    };

    it('should return valid request adhering to oRTB specs when valid bids are used', function () {
      let req = spec.buildRequests([validBidRequest], bidderRequest);
      expect(req).be.an('object');
      expect(req).to.have.property('method', 'POST');
      expect(req).to.have.property('url');
      expect(req.url).to.contain('https://demo.arrepiblik.com/dmx2');
      expect(req.data).to.exist.and.to.be.an('object');
      expect(req.data.imp).to.eql([expectedDataImp]);
    });

    it('should return break execution validBidRequests is null or empty or if bidderRequest is null', function () {
      assert.isUndefined(spec.buildRequests(null, null));
      assert.isUndefined(spec.buildRequests([], bidderRequest));
      assert.isUndefined(spec.buildRequests([validBidRequest], null));
    });

    it('should return valid request adhering to oRTB specs when valid bids are used (test for pos)', function () {
      validBidRequest.params.pos = 1;
      expectedDataImp.banner.pos = 1;
      let req = spec.buildRequests([validBidRequest], bidderRequest);
      expect(req).be.an('object');
      expect(req).to.have.property('method', 'POST');
      expect(req).to.have.property('url');
      expect(req.url).to.contain('https://demo.arrepiblik.com/dmx2');
      expect(req.data).to.exist.and.to.be.an('object');
      expect(req.data.imp).to.eql([expectedDataImp]);
    });

    it('test for empty ad sizes', function () {
      validBidRequest.sizes = [];
      let req = spec.buildRequests([validBidRequest], bidderRequest);
      expect(req).be.an('object');
      expect(req).to.have.property('method', 'POST');
      expect(req).to.have.property('url');
      expect(req.url).to.contain('https://demo.arrepiblik.com/dmx2');
      expect(req.data).to.exist.and.to.be.an('object');
      expect(req.data.imp).to.eql([]);
    });

    it('test for no ad sizes', function () {
      delete validBidRequest.sizes;
      let req = spec.buildRequests([validBidRequest], bidderRequest);
      expect(req).be.an('object');
      expect(req).to.have.property('method', 'POST');
      expect(req).to.have.property('url');
      expect(req.url).to.contain('https://demo.arrepiblik.com/dmx2');
      expect(req.data).to.exist.and.to.be.an('object');
      expect(req.data.imp).to.eql([]);
    });
  });

  describe('Test interpretResponse', function () {
    let bidResponse = {
      id: '27afbc932943a4',
      impid: '27afbc932943a4',
      dealid: 'dmx-deal-hp-24',
      price: 12.01,
      crid: '1022-250',
      adm: "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>",
      w: 300,
      h: 250
    };

    let serverResponse;
    beforeEach(function() {
      serverResponse = {
        body: {
          id: 'abcdef',
          seatbid: [{
            seat: '1234',
            bid: [{
              id: '27afbc932943a4',
              impid: '27afbc932943a4',
              dealid: 'dmx-deal-hp-24',
              price: 12.01,
              crid: '1022-250',
              adm: "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>",
              w: 300,
              h: 250
            }]
          }]
        }
      };
    });

    it('should return a bid in the format expected by prebid when a valid bid is received', function () {
      let resp = spec.interpretResponse(serverResponse);
      expect(resp).to.be.an('array').to.have.lengthOf(1);
      expect(resp[0]).to.eql({
        cpm: 12.01,
        currency: 'USD',
        netRevenue: true,
        requestId: '27afbc932943a4',
        dealId: 'dmx-deal-hp-24',
        creativeId: '1022-250',
        ad: "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>",
        width: 300,
        height: 250,
        mediaType: 'banner',
        ttl: 500
      });
    });

    it('should return 2 bids in the format expected by prebid when 2 valid bids are received', function () {
      serverResponse.body.seatbid.push(serverResponse.body.seatbid[0]);

      let resp = spec.interpretResponse(serverResponse);
      expect(resp).to.be.an('array').to.have.lengthOf(2);
      expect(resp[0]).to.eql({
        cpm: 12.01,
        currency: 'USD',
        netRevenue: true,
        requestId: '27afbc932943a4',
        dealId: 'dmx-deal-hp-24',
        creativeId: '1022-250',
        ad: "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>",
        width: 300,
        height: 250,
        mediaType: 'banner',
        ttl: 500
      });

      expect(resp[1]).to.eql({
        cpm: 12.01,
        currency: 'USD',
        netRevenue: true,
        requestId: '27afbc932943a4',
        dealId: 'dmx-deal-hp-24',
        creativeId: '1022-250',
        ad: "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>",
        width: 300,
        height: 250,
        mediaType: 'banner',
        ttl: 500
      });
    });

    it('should return empty bids array if the serverResponse is empty or if seatbid array is empty or not present or if bid object in the seatbid array doesn not have bid prop', function () {
      delete serverResponse.body.seatbid[0].bid;
      assert.isEmpty(spec.interpretResponse(serverResponse));

      delete serverResponse.body.seatbid;
      assert.isEmpty(spec.interpretResponse(serverResponse));

      delete serverResponse.body;
      assert.isEmpty(spec.interpretResponse(serverResponse));

      assert.isEmpty(spec.interpretResponse({}));
    });
  });
});
