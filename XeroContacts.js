/**
 * hrmny Quote Builder - Xero Contacts Management
 * Create and manage contacts in Xero
 */

function ensureXeroContactReadiness_() {
  const health = typeof getXeroHealthStatus === 'function'
    ? getXeroHealthStatus()
    : { connected: (typeof isXeroAuthorized === 'function' ? isXeroAuthorized() : false), message: 'Not authorized with Xero' };
  if (!health || !health.connected) {
    throw new AppError('XERO_AUTH_ERROR', (health && health.message) ? health.message : 'Xero is not authorized. Authorize before managing contacts.');
  }
}

/**
 * Search for contact by name or email
 * @param {string} nameOrEmail - Contact name or email
 * @return {Object|null} Contact object or null if not found
 */
function searchXeroContact(nameOrEmail) {
  ensureXeroContactReadiness_();
  try {
    // Sanitize search string for Xero API
    const searchTerm = nameOrEmail.replace(/"/g, '').trim();
    if (!searchTerm || searchTerm.length < 2) {
      return null;
    }
    const encodedWhere = encodeURIComponent('Name.Contains("' + searchTerm + '")');
    const response = callXeroAPI('/Contacts?where=' + encodedWhere, 'GET');

    if (response.Contacts && response.Contacts.length > 0) {
      try { UnifiedLogger.info('XeroContacts', 'Contact found', { name: response.Contacts[0].Name, id: response.Contacts[0].ContactID }); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
      return response.Contacts[0];
    }

    try { UnifiedLogger.info('XeroContacts', 'Contact not found', { query: searchTerm }); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    return null;

  } catch (error) {
    try { UnifiedLogger.warn('XeroContacts', 'Error searching contact', String(error)); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    return null;
  }
}

/**
 * Get contact by ID
 * @param {string} contactId - Xero contact ID
 * @return {Object|null} Contact object
 */
function getXeroContactById(contactId) {
  ensureXeroContactReadiness_();
  try {
    const response = callXeroAPI('/Contacts/' + contactId, 'GET');

    if (response.Contacts && response.Contacts.length > 0) {
      return response.Contacts[0];
    }

    return null;

  } catch (error) {
    try { UnifiedLogger.warn('XeroContacts', 'Error getting contact', String(error)); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    return null;
  }
}

/**
 * Create new contact in Xero
 * @param {Object} contactData - Contact information
 * @return {Object} Created contact
 */
function createXeroContact(contactData) {
  ensureXeroContactReadiness_();
  const payload = {
    Contacts: [{
      Name: contactData.name,
      EmailAddress: contactData.email || '',
      FirstName: contactData.firstName || '',
      LastName: contactData.lastName || '',
      Phones: contactData.phone ? [{
        PhoneType: 'MOBILE',
        PhoneNumber: contactData.phone
      }] : [],
      Addresses: contactData.address ? [{
        AddressType: 'POBOX',
        City: contactData.city || '',
        Country: contactData.country || 'AE'
      }] : []
    }]
  };

  try {
    const response = callXeroAPI('/Contacts', 'POST', payload);

    if (response.Contacts && response.Contacts.length > 0) {
      const contact = response.Contacts[0];
      try { UnifiedLogger.info('XeroContacts', 'Contact created', { contactId: contact.ContactID, name: contact.Name }); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
      return contact;
    }

    throw new AppError('XERO_CONTACT_ERROR', 'No contact returned from Xero');

  } catch (error) {
    try { UnifiedLogger.error('XeroContacts', 'Error creating contact', error); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    throw error;
  }
}

/**
 * Update existing contact in Xero
 * @param {string} contactId - Xero contact ID
 * @param {Object} contactData - Contact information to update
 * @return {Object} Updated contact
 */
function updateXeroContact(contactId, contactData) {
  ensureXeroContactReadiness_();
  const payload = {
    Contacts: [{
      ContactID: contactId,
      Name: contactData.name,
      EmailAddress: contactData.email || '',
      FirstName: contactData.firstName || '',
      LastName: contactData.lastName || '',
      Phones: contactData.phone ? [{
        PhoneType: 'MOBILE',
        PhoneNumber: contactData.phone
      }] : [],
      Addresses: contactData.address ? [{
        AddressType: 'POBOX',
        City: contactData.city || '',
        Country: contactData.country || 'AE'
      }] : []
    }]
  };

  try {
    const response = callXeroAPI('/Contacts/' + contactId, 'POST', payload);

    if (response.Contacts && response.Contacts.length > 0) {
      const contact = response.Contacts[0];
      try { UnifiedLogger.info('XeroContacts', 'Contact updated', { contactId: contact.ContactID, name: contact.Name }); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
      return contact;
    }

    throw new AppError('XERO_CONTACT_ERROR', 'No contact returned from Xero');

  } catch (error) {
    try { UnifiedLogger.error('XeroContacts', 'Error updating contact', error); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    throw error;
  }
}

/**
 * Get or create contact
 * Searches for existing contact, creates if not found
 * @param {Object} contactData - Contact information
 * @return {Object} Contact object
 */
function getOrCreateContact(contactData) {
  ensureXeroContactReadiness_();
  // Search first
  let contact = searchXeroContact(contactData.name);

  if (contact) {
    try { UnifiedLogger.info('XeroContacts', 'Using existing contact', { contactId: contact.ContactID }); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    return contact;
  }

  // Create if not found
  try { UnifiedLogger.info('XeroContacts', 'Contact not found, creating new contact'); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
  return createXeroContact(contactData);
}

/**
 * List all contacts (for debugging)
 * @param {number} limit - Max number of contacts to return
 * @return {Array} Array of contacts
 */
// Evidence: UnifiedLogger.startTrace at 01_UnifiedLogger.js:573
function listXeroContacts(limit) {
  const trace = UnifiedLogger.startTrace('XeroContacts', 'listXeroContacts');
  try {
  limit = limit || 100;
  ensureXeroContactReadiness_();

  try {
    const response = callXeroAPI('/Contacts?page=1', 'GET');
    if (response.Contacts) {
      trace.complete('Xero contacts listed', { contactCount: response.Contacts.slice(0, limit).length });
      return response.Contacts.slice(0, limit);
    }
    trace.complete('Xero contacts listed', { contactCount: 0 });
    return [];
  } catch (error) {
    try { UnifiedLogger.error('XeroContacts', 'Error listing contacts', error); } catch (ignore) {
      console.error('[XeroContacts] Error:', ignore.message, ignore.stack);
    }
    trace.complete('Xero contacts listed (with errors)', { contactCount: 0 });
    return [];
  }

  } catch (error) {
    trace.fail('listXeroContacts failed', error);
    return [];
  }
}
