const xml2js = require('xml2js');

const ABR_ENDPOINT = 'https://abr.business.gov.au/abrxmlsearch/abrxmlsearch.asmx/SearchByABNv202001';

/**
 * Calls the Australian Business Register SearchByABNv202001 endpoint,
 * parses the returned XML, and normalises the result.
 */
async function verifyAbn(abn) {
  const guid = process.env.ABN_API_GUID;
  const cleanAbn = String(abn).replace(/\s/g, '');

  if (!/^\d{11}$/.test(cleanAbn)) {
    return { success: false, error: 'ABN must be exactly 11 digits' };
  }

  const params = new URLSearchParams({
    searchString: cleanAbn,
    includeHistoricalDetails: 'N',
    authenticationGuid: guid,
  });
  const url = `${ABR_ENDPOINT}?${params.toString()}`;

  let xmlText;
  try {
    const response = await fetch(url, { method: 'GET' });
    xmlText = await response.text();
  } catch (err) {
    return { success: false, error: 'Unable to reach the Australian Business Register. Please try again shortly.' };
  }

  let parsed;
  try {
    parsed = await xml2js.parseStringPromise(xmlText, { explicitArray: false, ignoreAttrs: true, tagNameProcessors: [xml2js.processors.stripPrefix] });
  } catch (err) {
    return { success: false, error: 'Unable to parse response from the Australian Business Register' };
  }

  const response = parsed && parsed.ABRPayloadSearchResults;
  const exception = response && response.response && response.response.exception;
  if (exception) {
    const desc = exception.exceptionDescription || 'ABN not found or cancelled — please check your number.';
    return { success: false, error: desc };
  }

  const entity = response && response.response && response.response.businessEntity202001;
  if (!entity) {
    return { success: false, error: 'ABN not found or cancelled — please check your number.' };
  }

  const status = entity.entityStatus && (Array.isArray(entity.entityStatus) ? entity.entityStatus[0] : entity.entityStatus);
  const statusCode = status && status.entityStatusCode;
  const statusFromDate = status && status.effectiveFrom;

  if (statusCode && statusCode.toUpperCase() !== 'ACTIVE') {
    return { success: false, error: 'ABN not found or cancelled — please check your number.', abnStatus: statusCode };
  }

  const mainName = entity.mainName || entity.mainTradingName || entity.legalName || {};
  const orgName = mainName.organisationName
    || (entity.legalName && `${entity.legalName.givenName || ''} ${entity.legalName.familyName || ''}`.trim())
    || 'Unknown Business Name';

  const addr = entity.mainBusinessPhysicalAddress || {};
  const state = addr.stateCode || null;
  const postcode = addr.postcode || null;

  const entityType = entity.entityType && entity.entityType.entityDescription;

  const abnRegDate = entity.ABN && entity.ABN.identifierStatusFromDate;

  let newlyRegisteredWarning = null;
  if (abnRegDate) {
    const regDate = new Date(abnRegDate);
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    if (regDate > sixMonthsAgo) {
      newlyRegisteredWarning = 'This is a newly registered ABN — additional review may be required.';
    }
  }

  return {
    success: true,
    abn: cleanAbn,
    companyName: orgName,
    abnStatus: statusCode || 'Active',
    entityType: entityType || null,
    state,
    postcode,
    abnRegistrationDate: abnRegDate || null,
    newlyRegisteredWarning,
  };
}

module.exports = { verifyAbn };
