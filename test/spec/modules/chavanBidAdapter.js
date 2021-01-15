import { getAdUnitSizes, logWarn } from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
const BIDDER_CODE = 'chavan';
const ENDPOINT_URL = 'https://demo.arrepiblik.com/dmx2';
const TTL = 500;
const NET_REVENUE = true;
export const spec = {
  code: BIDDER_CODE,

  /**
     * Determines whether or not the given bid request is valid.
     *
     * @param {BidRequest} bid The bid params to validate.
     * @return boolean True if this is a valid bid, and false otherwise.
    */
  isBidRequestValid: function (bid) {
    return !!(bid && bid.params && bid.params.hasOwnProperty('placementId'));
  },

  /**
     * Make a server request from the list of BidRequests.
     *
     * @param {validBidRequests[]} - an array of bids
     * @return ServerRequest Info describing the request to the server.
    */
  buildRequests: function (validBidRequests, bidderRequest) {
    if (!validBidRequests || !validBidRequests.length || !bidderRequest) {
      return;
    }
    const refererInfo = bidderRequest.refererInfo;

    // Set id, site and device info as per the oRTB spec (version 2.5)
    const openRtbBidRequest = {
      id: bidderRequest.auctionId,
      site: {
        domain: location.hostname,
        page: refererInfo.referer,
        ref: document.referrer
      },
      device: {
        ua: navigator.userAgent
      },
      imp: []
    };

    validBidRequests.forEach((bid, i) => {
      const placementId = (bid.params && bid.params.placementId) ? bid.params.placementId : '1234';

      // Position of the slot on the page. (0 = Unknown, 1 = ATF, 3 = BTF, 4 = Header, 5 = Footer, 6 = Sidebar, 7 = Full Screen).
      let pos = parseInt(bid.params.pos, 10);
      if (isNaN(pos)) {
        logWarn(`Chavan Test Bidder: there is an invalid POS: ${bid.params.pos}`);
        pos = 0;
      }

      // Get the ad sizes using prebid's utility method.
      const adSizes = getAdUnitSizes(bid);

      let imps = this.buildImps(adSizes, bid, placementId, pos);
      if (imps.length > 0) {
        imps.forEach(i => openRtbBidRequest.imp.push(i));
      }
    });

    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: openRtbBidRequest,
      options: {
        contentType: 'application/json',
        withCredentials: false
      }
    };
  },

  /**
     * Function to build banner impressions.
     * @param {Array} adSizes
     * @param {Object} bid
     * @param {String} placementId
     * @param {Integer} pos
     */
  buildImps: function(adSizes, bid, placementId, pos) {
    let format = [];
    let imps = [];

    // Clean the sizes array to make sure they're in the right format. We can add filtering logic here to exclude sizes that
    // the bidder does not support.
    adSizes.forEach((size, i) => {
      if (!size || size.length !== 2) {
        return;
      }
      format.push({
        w: size[0],
        h: size[1],
      });
    });

    if (format.length > 0) {
      const imp = {
        id: `${bid.bidId}`,
        banner: {
          format,
          pos
        },
        tagid: placementId,
      };
      imps.push(imp);
    }
    return imps;
  },

  /**
     * Map the bid response from server to the bids array format expected by prebid.
     *
     * @param {ServerResponse} serverResponse response from the server.
     * @return {Bid[]} An array of bids.
    */
  interpretResponse: function (serverResponse) {
    const bids = [];

    if (!serverResponse.hasOwnProperty('body') || !serverResponse.body.hasOwnProperty('seatbid')) {
      return bids;
    }

    const serverResponseBody = serverResponse.body;
    const seatbids = serverResponseBody.seatbid;

    seatbids.forEach((seatbid) => {
      let bid = null;
      if (!seatbid.hasOwnProperty('bid')) {
        return;
      }

      // Transform the raw bid in bid response to the format that will be accepted by prebid.
      const innerBids = seatbid.bid;
      innerBids.forEach((innerBid) => {
        bid = this.parseBid(innerBid, serverResponseBody.cur);
        bids.push(bid);
      });
    });

    return bids;
  },

  /**
     * Parses a bid from the server and maps it to the object format expected by Prebid.
     *
     * @param  {object} bid   The bid to be parsed.
     * @param  {string} currency Global currency in bid response.
    */
  parseBid: function (bid, currency) {
    const mappedBid = {
      cpm: parseFloat(bid.price) || 0.0,
      currency: currency || 'USD',
      netRevenue: NET_REVENUE,
      requestId: bid.impid,
      dealId: bid.dealid,
      creativeId: bid.crid || null,
      ad: bid.adm,
      width: bid.w,
      height: bid.h,
      mediaType: 'banner',
      ttl: TTL
    }

    return mappedBid;
  }
}
registerBidder(spec);
