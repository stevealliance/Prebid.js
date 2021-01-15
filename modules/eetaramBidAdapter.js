import * as utils from '../src/utils.js';
import { registerBidder } from '../src/adapters/bidderFactory.js';
import { config } from '../src/config.js';
import { BANNER } from '../src/mediaTypes.js';

const BIDDER_CODE = 'eetaram';
const ENDPOINT_URL = 'https://demo.arrepiblik.com/dmx2';

/**
 * Purpose: build OpenRTB request template
 *
 * @param referer
 * @param gdprApplies
 * @param uspConsent
 * @param consentString
 * @returns {{ext: {}, site: {ref: string, publisher: {}, page: (*|string)}, at: number, regs: {ext: {us_privacy: *, gdpr: number}, coppa: number}, id: string, imp: [], device: {}, user: {ext: {consent: *}}}}
 */
function buildOpenRTBRequestParams (
  referer,
  gdprApplies,
  uspConsent,
  consentString,
  validBidRequests) {
  let regs = {}
  if (config.getConfig('coppa') === true) {
    regs.coppa = 1
  }
  if (gdprApplies) {
    regs.ext = regs.ext || {}
    regs.ext = {
      ...regs.ext,
      gdpr: 1
    }
  }
  if (uspConsent) {
    regs.ext = regs.ext || {}
    regs.ext = {
      ...regs.ext,
      us_privacy: uspConsent
    }
  }
  return {
    id: new Date().getTime(),
    imp: buildImpressionObject(validBidRequests),
    site: {
      page: referer || window.location.href,
      ref: window.document.referrer,
      publisher: {}
    },
    device: {
      ua: navigator.userAgent,
      js: 1,
      dnt: (navigator.doNotTrack == 'yes' || navigator.doNotTrack == '1' || navigator.msDoNotTrack == '1') ? 1 : 0,
      h: screen.height,
      w: screen.width,
      language: navigator.language
    },
    at: 1,
    user: {
      ext: {
        consent: consentString
      }
    },
    ext: {},
    regs
  };
}

/**
 * Purpose: To filter banner ads from validBidRequests
 *
 * @param bid
 * @returns {*}
 */
function isBannerAd(bid) {
  const {mediaTypes: { banner }} = bid;
  return typeof banner === 'object'
    ? !!(banner.sizes && utils.isArray(banner.sizes))
    : false
}

/**
 * Purpose: create size related attributes for the banner
 *
 * @param sizes
 * @returns {{w: number, h: number}|*}
 */
function formatSizeAttributes(sizes) {
  if (utils.isArray(sizes[0])) {
    return {
      format: sizes.map(size => ({ w: size[0], h: size[1] }))
    }
  } else {
    return {
      w: parseInt(sizes[0], 10),
      h: parseInt(sizes[1], 10)
    }
  }
}

/**
 * Purpose: Build impressions object that comply with openRTB policies
 *
 * @param validBidRequests
 * @returns {*}
 */
function buildImpressionObject(validBidRequests) {
  return validBidRequests
    .filter(eachBid => isBannerAd(eachBid))
    .map(eachBid => {
      const {bidId, params: { placementId }, mediaTypes: {banner: { sizes }}} = eachBid;
      return {
        id: bidId,
        tagid: placementId,
        secure: 1,
        banner: {
          ...formatSizeAttributes(sizes),
          topframe: utils.inIframe() ? 0 : 1,
        }
      }
    })
}

export const spec = {
  code: BIDDER_CODE,
  supportedMediaTypes: [BANNER],
  /**
   * verify bid request param
   * @param bid
   * @returns {boolean}
   */
  isBidRequestValid: (bid) => !!(bid.params && bid.params.placementId),
  buildRequests: (validBidRequests, bidderRequest) => {
    const {gdprConsent: {gdprApplies, consentString} = {}, uspConsent, refererInfo: {referer} = {}} = bidderRequest
    const bidRequestPayload = buildOpenRTBRequestParams(referer, gdprApplies, uspConsent, consentString, validBidRequests)
    return {
      method: 'POST',
      url: ENDPOINT_URL,
      data: bidRequestPayload
    };
  },

  /**
   * Purpose : Parse the server response and create a bidResponse object containing one or more bids
   *
   * @param serverResponse
   * @param request
   * @returns {*[]}
   */
  interpretResponse: (serverResponse, request) => {
    const {body: {seatbid, cur} = {}} = serverResponse
    if (!seatbid || !utils.isArray(seatbid)) {
      return []
    };
    const [firstBid] = seatbid;
    const {bid} = firstBid;
    if (!bid || (!utils.isArray(bid) && bid.length > 0)) {
      return []
    }
    let bidResponses = bid.map((eachBid) => {
      const {adm, crid, dealid, h, id, impid, price, w, meta = {}} = eachBid
      return {
        requestId: impid,
        cpm: (parseFloat(price) || 0).toFixed(2),
        currency: cur,
        width: w,
        height: h,
        creativeId: crid || id,
        dealId: dealid,
        netRevenue: true,
        ttl: 300,
        ad: adm,
        meta
      }
    });
    return bidResponses;
  },

  /**
   *
   * @param syncOptions
   * @param serverResponses
   * @param gdprConsent
   * @param uspConsent
   * @returns {[]}
   */
  getUserSyncs: (syncOptions, serverResponses, gdprConsent, uspConsent) => {
    const syncs = []
    /**
     * Code from prebid document
     */
    /*    let gdprParams;
        if (typeof gdprConsent.gdprApplies === 'boolean') {
          gdprParams = `gdpr=${Number(gdprConsent.gdprApplies)}&gdpr_consent=${gdprConsent.consentString}`;
        } else {
          gdprParams = `gdpr_consent=${gdprConsent.consentString}`;
        }
        if (syncOptions.iframeEnabled) {
          syncs.push({
            type: 'iframe',
            url: '//acdn.adnxs.com/ib/static/usersync/v3/async_usersync.html?' + gdprParams
          });
        }
        if (syncOptions.pixelEnabled && serverResponses.length > 0) {
          syncs.push({
            type: 'image',
            url: serverResponses[0].body.userSync.url + gdprParams
          });
        } */
    return syncs;
  },

/*  onTimeout: (timeoutData) => {
    // when an adpater timed out for an auction.
  },
  onBidWon: (bid) => {
    // when a bid from the adapter won the auction.
  },
  onSetTargeting: (bid) => {
    // when the adserver targeting has been set for a bid from the adapter.
  } */
}
registerBidder(spec);
export {
  buildOpenRTBRequestParams,
  buildImpressionObject,
  isBannerAd,
  formatSizeAttributes
}
