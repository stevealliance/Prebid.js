import * as utils from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { config } from '../src/config.js';
import { BANNER } from '../src/mediaTypes.js';

const ENDPOINT = 'https://demo.arrepiblik.com/dmx2';
const BIDDER_CODE = 'chx';

export const spec = {
  code: BIDDER_CODE,
  supportedFormat: [BANNER],
  supportedMediaTypes: [BANNER],

  isBidRequestValid: (bid) => {
    return !!(
      bid.params.placementId && bid.mediaTypes.banner.sizes.length >= 1
    );
  },

  buildRequests: (bidRequest, bidderRequest) => {
    // OpenRTB request
    let ortbRequest = {
      id: utils.generateUUID(),
      cur: ['USD'],
      tmax: config.getConfig('bidderTimeout') + 1000,
      site: {
        publisher: {
          id: String(bidRequest[0].params.publisher).toLowerCase(),
          name: String(bidRequest[0].params.publisher),
          domain: String(bidRequest[0].params.domain),
        },
      },
    };

    // Impression
    ortbRequest.imp = [
      {
        id: bidRequest[0].bidId,
        bidfloor: 2.0,
        banner: {
          topframe: 1,
          w: bidRequest[0].sizes[0][0],
          h: bidRequest[0].sizes[0][1],
          format: bidRequest[0].sizes.map((size) => {
            return {
              w: size[0],
              h: size[1],
            };
          }),
        },
      },
    ];

    // Request
    let req = {
      method: 'POST',
      url: ENDPOINT,
      data: JSON.stringify(ortbRequest),
      bidderRequest,
    };

    return req;
  },

  interpretResponse: (response, bidRequest) => {
    let body = response.body || { seatbid: [] };

    // For each seatbid, we find the winning bid.
    let wins = body.seatbid.reduce((wins, bids) => {
      // For each set of bids, we find the winning one.
      let best = bids.bid.reduce(
        (best, current) => {
          if (current.price > best.price) {
            current.ad = current.adm;
            current.requestId = current.impid;
            current.cpm = parseFloat(current.price);
            current.currency = body.cur;
            current.width = current.w;
            current.height = current.h;
            current.ttl = 360;
            current.netRevenue = true;
            current.creativeId = current.crid;
            return current;
          }
          return best;
        },
        { price: 0 }
      );
      if (best.requestId) {
        wins.push(best);
      }
      return wins;
    }, []);
    return wins;
  },

  onTimeout: (data) => {
    // When the request times out
    document.getElementById('to-yes').style.display = 'inline';
    document.getElementById('bw-no').style.display = 'inline';
  },

  onBidWon: (bid) => {
    // When a bid was won
    document.getElementById('to-no').style.display = 'inline';
    document.getElementById('bw-yes').style.display = 'inline';
  },
};

registerBidder(spec);
