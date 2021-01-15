import {
  buildOpenRTBRequestParams,
  buildImpressionObject,
  isBannerAd,
  formatSizeAttributes,
  spec
} from 'modules/eetaramBidAdapter'
import { expect } from 'chai';
import {config} from 'src/config.js';

describe('Eetaram Adapter', () => {
  const { isBidRequestValid, buildRequests, interpretResponse, getUserSyncs } = spec

  describe('validate all required functions in the module', () => {
    it('should have all the functions', () => {
      expect(buildOpenRTBRequestParams).to.exist.and.to.be.a('function');
      expect(buildImpressionObject).to.exist.and.to.be.a('function');
      expect(isBannerAd).to.exist.and.to.be.a('function');
      expect(formatSizeAttributes).to.exist.and.to.be.a('function');
      expect(isBidRequestValid).to.exist.and.to.be.a('function');
      expect(buildRequests).to.exist.and.to.be.a('function');
      expect(interpretResponse).to.exist.and.to.be.a('function');
      expect(getUserSyncs).to.exist.and.to.be.a('function');
    })
  });

  describe('isBannerAd', () => {
    let bid
    beforeEach(() => {
      bid = {
        mediaTypes: {
          banner: {
            sizes: []
          }
        }
      }
    });

    it('should return true if the bid object is a Banner and have sizes attribute', () => {
      expect(isBannerAd(bid)).to.be.equal(true)
    });

    it('should return false if sizes attribute is not array', () => {
      bid.mediaTypes.banner.sizes = {}
      expect(isBannerAd(bid)).to.be.equal(false)
    });

    it('should return false if sizes attribute is missing', () => {
      delete bid.mediaTypes.banner.sizes
      expect(isBannerAd(bid)).to.be.equal(false)
    });

    it('should return false if banner is not in the mediaTypes', () => {
      delete bid.mediaTypes.banner
      expect(isBannerAd(bid)).to.be.equal(false)
    })

    it('should return false if mediaTypes is video or anything but banner', () => {
      bid.mediaTypes = {
        video: {}
      }
      expect(isBannerAd(bid)).to.be.equal(false)
    })
  });

  describe('formatSizeAttributes', () => {
    it('should return an object with w and h attributes', () => {
      expect(formatSizeAttributes([728, 90])).to.have.all.keys('w', 'h');
      expect(formatSizeAttributes([728, 90])).to.not.have.property('format');
    });
    it('should return an object with format attributes', () => {
      expect(formatSizeAttributes([[728, 90]])).to.have.all.keys('format');
      expect(formatSizeAttributes([[728, 90]])).to.not.have.any.keys('w', 'h');
    });
  });

  describe('isBidRequestValid', () => {
    let bid
    beforeEach(() => {
      bid = {
        params: {
          placementId: '12345'
        }
      }
    });

    it('should return true if the bid object has params and placementId attributes', () => {
      expect(isBidRequestValid(bid)).to.be.equal(true)
    });

    it('should return false if placementId is missing', () => {
      delete bid.params.placementId
      expect(isBidRequestValid(bid)).to.be.equal(false)
    });

    it('should return false if params is missing', () => {
      delete bid.params
      expect(isBidRequestValid(bid)).to.be.equal(false)
    });
  });

  describe('buildImpressionObject', () => {
    let validBidRequests
    let bid
    beforeEach(() => {
      validBidRequests = [];
      bid = {
        bidId: '12345',
        params: {
          placementId: '12345'
        },
        mediaTypes: {
          banner: {
            sizes: [[300, 250], [300, 600]]
          }
        }
      }
    });
    it('should return valid impressions array to add it to the bid request ', () => {
      expect(buildImpressionObject(validBidRequests)).to.be.an('array').that.is.empty

      validBidRequests.push(bid)
      let impression = buildImpressionObject(validBidRequests)
      expect(impression).to.be.an('array').that.have.lengthOf(1)
      expect(impression[0]).to.have.all.keys('id', 'tagid', 'secure', 'banner')
      expect(impression[0].banner).to.have.all.keys('format', 'topframe')

      let secondBid = {...bid}
      secondBid.mediaTypes.banner.sizes = [300, 250]
      validBidRequests.push(secondBid)
      expect(buildImpressionObject(validBidRequests)).to.be.an('array').that.have.lengthOf(2)
      impression = buildImpressionObject(validBidRequests)
      expect(impression[1]).to.have.all.keys('id', 'tagid', 'secure', 'banner')
      expect(impression[1].banner).to.have.all.keys('w', 'h', 'topframe')
    })
  });

  describe('buildOpenRTBRequestParams', () => {
    let validBidRequests, mockConfig, bid, referer, gdprApplies, uspConsent, consentString
    beforeEach(() => {
      validBidRequests = [];
      gdprApplies = true;
      consentString = 'abcdef12345';
      uspConsent = '12345abcde';
      referer = 'https://eetaram.com'
      bid = {
        bidId: '12345',
        params: {
          placementId: '12345'
        },
        mediaTypes: {
          banner: {
            sizes: [[300, 250], [300, 600]]
          }
        }
      }
      mockConfig = {
        'coppa': true
      };
      let sandbox = sinon.sandbox.create();
      sandbox.stub(config, 'getConfig').callsFake(key => {
        return mockConfig[key];
      });
    });
    afterEach(function () {
      config.getConfig.restore(); // Unwraps the spy
    });

    it('should return valid openRTB request object', () => {
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload).to.have.all.keys('id', 'imp', 'site', 'device', 'at', 'user', 'ext', 'regs')
      expect(openRTBPayload.imp).to.be.an('array').that.is.empty

      validBidRequests.push(bid)
      openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload.imp).to.be.an('array').that.have.lengthOf(1)
      expect(openRTBPayload.imp[0]).to.have.all.keys('id', 'tagid', 'secure', 'banner')
      expect(openRTBPayload.imp[0].banner).to.have.all.keys('format', 'topframe')
      expect(openRTBPayload.site).to.have.all.keys('page', 'ref', 'publisher')
      expect(openRTBPayload.user).to.have.all.keys('ext')
      expect(openRTBPayload.regs).to.have.all.keys('coppa', 'ext')
    })

    it('should not include coppa flag in the bid request if config is not defined', () => {
      delete mockConfig.coppa
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload.regs).to.not.have.all.keys('coppa')
    })

    it('should include gdpr flag if gdprApplies is true', () => {
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload.regs).to.have.any.keys('ext')
      expect(openRTBPayload.regs.ext).to.have.any.keys('gdpr')
      expect(openRTBPayload.regs.ext.gdpr).to.equals(1)
    })
    it('should not include gdpr flag if gdprApplies is false', () => {
      gdprApplies = false;
      uspConsent = '12345abcde';
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload.regs).to.have.any.keys('ext')
      expect(openRTBPayload.regs.ext).to.not.have.any.keys('gdpr')
    })

    it('should not include us_privacy if uspConsent is undefined', () => {
      gdprApplies = true;
      uspConsent = undefined;
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload.regs).to.have.any.keys('ext')
      expect(openRTBPayload.regs.ext).to.not.have.any.keys('us_privacy')
    })

    it('should add referer value to site.page if referer is defined', () => {
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload).to.have.any.keys('site')
      expect(openRTBPayload.site).to.have.any.keys('page', 'ref', 'publisher')
      expect(openRTBPayload.site.page).to.exist.and.equals(referer)
    })

    it('should not add referer value to site.page if referer is undefined', () => {
      referer = undefined
      let openRTBPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
      expect(openRTBPayload).to.have.any.keys('site')
      expect(openRTBPayload.site).to.have.any.keys('page', 'ref', 'publisher')
      expect(openRTBPayload.site.page).to.exist.and.not.equals(referer)
    })
  });

  describe('buildRequests', () => {
    let validBidRequests, bidderRequest, bid
    beforeEach(() => {
      bidderRequest = {
        gdprConsent: {
          gdprApplies: true,
          consentString: 'abcdef12345'
        },
        uspConsent: '12345abcde',
        refererInfo: {
          referer: 'https://eetaram.com'
        }
      };
      bid = {
        bidId: '12345',
        params: {
          placementId: '12345'
        },
        mediaTypes: {
          banner: {
            sizes: [[300, 250], [300, 600]]
          }
        }
      };
      validBidRequests = [];
    })
    it('should return valid bid request', () => {
      const bidRequest = buildRequests(validBidRequests, bidderRequest)
      expect(bidRequest).to.have.all.keys('method', 'url', 'data')
    })
  });

  describe('interpretResponse', () => {
    let serverResponse = {}
    beforeEach(() => {
      serverResponse.body = {'id': 1601553106696, 'cur': 'USD', 'seatbid': [{'bid': [{'id': '21642c809eeec4', 'impid': '21642c809eeec4', 'dealid': 'dmx-deal-hp-24', 'price': 12.01, 'adm': "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>", 'crid': '2889617267', 'w': 300, 'h': 250}, {'id': '21642c809eeec4', 'impid': '21642c809eeec4', 'dealid': 'dmx-deal-hp-25', 'price': 12.01, 'adm': "<img src='https://via.placeholder.com/300x250.png?text=dmx+2.0+300x250' height='250' width='300'/>", 'crid': '4699417612', 'w': 300, 'h': 250}]}]}
    })

    it('should return valid bid Response', () => {
      let bidResponse = interpretResponse(serverResponse)
      expect(bidResponse).to.be.an('array').of.length(2)
      expect(bidResponse[0]).to.have.all.keys('requestId', 'cpm', 'currency', 'width', 'height', 'creativeId', 'dealId', 'netRevenue', 'ttl', 'ad', 'meta')
    })
    it('should use id for creativeId if bid[0].crid is undefined ', () => {
      delete serverResponse.body.seatbid[0].bid[0].crid
      let bidResponse = interpretResponse(serverResponse)
      expect(bidResponse[0].creativeId).to.equals(serverResponse.body.seatbid[0].bid[0].id)
    })
    it('should have cpm set to 0.00 if bid[0].price is undefined ', () => {
      delete serverResponse.body.seatbid[0].bid[0].price
      let bidResponse = interpretResponse(serverResponse)
      expect(bidResponse[0].cpm).to.equals('0.00')
    })
    it('should return empty bid Response if seatbid.bid is undefined ', () => {
      delete serverResponse.body.seatbid[0].bid
      let bidResponse = interpretResponse(serverResponse)
      expect(bidResponse).to.be.an('array').that.is.empty
    })
    it('should return empty bid Response if request doesn\'t have bids', () => {
      serverResponse = {}
      let bidResponse = interpretResponse(serverResponse)
      expect(bidResponse).to.be.an('array').that.is.empty
    })
  });

  describe('getUserSyncs', () => {
    let syncOptions, serverResponses, gdprConsent, uspConsent
    beforeEach(() => {
    })
    it('should return empty array', () => {
      expect(getUserSyncs(syncOptions, serverResponses, gdprConsent, uspConsent)).to.be.an('array').that.is.empty
    })
  });
})
