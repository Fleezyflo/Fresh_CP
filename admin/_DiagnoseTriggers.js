/**
 * Diagnostic tool to see what triggers are installed
 *
 * Triggers run automatically and could be deleting properties
 * without you knowing it.
 */

/**
 * Show all installed triggers
 */
function showAllInstalledTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  Logger.log('='.repeat(80));
  Logger.log('INSTALLED TRIGGERS');
  Logger.log('='.repeat(80));
  Logger.log('Total triggers: ' + triggers.length);
  Logger.log('');

  if (triggers.length === 0) {
    Logger.log('✅ No triggers installed');
    Logger.log('This is good - no automatic functions running');
    return;
  }

  triggers.forEach(function(trigger, index) {
    Logger.log('-'.repeat(80));
    Logger.log('TRIGGER #' + (index + 1));
    Logger.log('-'.repeat(80));
    Logger.log('Function: ' + trigger.getHandlerFunction());
    Logger.log('Trigger Source: ' + trigger.getTriggerSource());
    Logger.log('Trigger Source ID: ' + trigger.getTriggerSourceId());
    Logger.log('Unique ID: ' + trigger.getUniqueId());

    // Get event type
    const eventType = trigger.getEventType();
    Logger.log('Event Type: ' + eventType);

    // If time-based, show schedule
    if (eventType === ScriptApp.EventType.CLOCK) {
      Logger.log('⏰ TIME-BASED TRIGGER');
      // Try to get frequency (this varies by trigger type)
      try {
        Logger.log('  (Runs automatically on a schedule)');
      } catch (e) {
        // Can't get detailed schedule info from installed trigger
      }
    }

    // If spreadsheet trigger, show details
    if (eventType === ScriptApp.EventType.ON_OPEN) {
      Logger.log('📂 ON_OPEN TRIGGER (runs when spreadsheet opens)');
    }
    if (eventType === ScriptApp.EventType.ON_EDIT) {
      Logger.log('✏️ ON_EDIT TRIGGER (runs when spreadsheet is edited)');
    }
    if (eventType === ScriptApp.EventType.ON_CHANGE) {
      Logger.log('🔄 ON_CHANGE TRIGGER (runs when spreadsheet structure changes)');
    }
    if (eventType === ScriptApp.EventType.ON_FORM_SUBMIT) {
      Logger.log('📝 ON_FORM_SUBMIT TRIGGER (runs when form is submitted)');
    }

    Logger.log('');
  });

  Logger.log('='.repeat(80));
  Logger.log('SUSPICIOUS TRIGGERS TO CHECK');
  Logger.log('='.repeat(80));

  // Look for triggers that might be deleting properties
  const suspicious = [
    'deleteAllScriptProperties',
    'purgeNonessentialPropertiesMenu',
    'cleanStalePropertiesMenu',
    'resetBootstrapStateMenu',
    'runBootstrapStage'
  ];

  let foundSuspicious = false;
  triggers.forEach(function(trigger) {
    const funcName = trigger.getHandlerFunction();
    if (suspicious.indexOf(funcName) >= 0) {
      Logger.log('🚨 FOUND SUSPICIOUS TRIGGER: ' + funcName);
      Logger.log('   This function might be deleting properties!');
      Logger.log('   Trigger ID: ' + trigger.getUniqueId());
      foundSuspicious = true;
    }
  });

  if (!foundSuspicious) {
    Logger.log('✅ No suspicious triggers found');
    Logger.log('Triggers look normal');
  }

  Logger.log('');
  Logger.log('='.repeat(80));
  Logger.log('NEXT STEPS');
  Logger.log('='.repeat(80));
  Logger.log('1. If you see suspicious triggers, delete them with: deleteTrigg er(triggerId)');
  Logger.log('2. Check what each trigger function does in your code');
  Logger.log('3. Consider temporarily disabling all triggers to test');
  Logger.log('');
  Logger.log('To delete a trigger:');
  Logger.log('  1. Copy the "Unique ID" from above');
  Logger.log('  2. Run: deleteTriggerById("paste-id-here")');
}

/**
 * Delete a specific trigger by ID
 * @param {string} triggerId - The unique ID of the trigger
 */
function deleteTriggerById(triggerId) {
  if (!triggerId) {
    Logger.log('❌ Error: Provide trigger ID');
    Logger.log('Usage: deleteTriggerById("trigger-unique-id")');
    return;
  }

  const triggers = ScriptApp.getProjectTriggers();
  let found = false;

  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getUniqueId() === triggerId) {
      const funcName = triggers[i].getHandlerFunction();
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log('✅ Deleted trigger: ' + funcName);
      Logger.log('   Trigger ID: ' + triggerId);
      found = true;
      break;
    }
  }

  if (!found) {
    Logger.log('❌ Trigger not found: ' + triggerId);
    Logger.log('Run showAllInstalledTriggers() to see valid IDs');
  }
}

/**
 * Delete ALL triggers (use with caution!)
 */
function deleteAllTriggers() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Delete ALL Triggers?',
    'This will delete ALL installed triggers. Are you sure?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    Logger.log('Cancelled');
    return;
  }

  const triggers = ScriptApp.getProjectTriggers();
  Logger.log('Deleting ' + triggers.length + ' trigger(s)...');

  triggers.forEach(function(trigger) {
    Logger.log('  Deleting: ' + trigger.getHandlerFunction());
    ScriptApp.deleteTrigger(trigger);
  });

  Logger.log('✅ All triggers deleted');
  Logger.log('Menu will still work (simple triggers like onOpen don\'t show in list)');
}

/**
 * Check if specific dangerous functions are being triggered
 */
function checkForDangerousTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const dangerous = {
    'deleteAllScriptProperties': '🔥 DELETES ALL PROPERTIES',
    'purgeNonessentialPropertiesMenu': '⚠️ Deletes non-whitelisted properties',
    'cleanStalePropertiesMenu': '⚠️ Deletes bootstrap/startup properties',
    'resetBootstrapStateMenu': '⚠️ Deletes bootstrap state',
    'runBootstrapStage': '⚠️ Might modify properties during bootstrap'
  };

  Logger.log('='.repeat(80));
  Logger.log('CHECKING FOR DANGEROUS TRIGGERS');
  Logger.log('='.repeat(80));

  let foundDangerous = false;

  triggers.forEach(function(trigger) {
    const funcName = trigger.getHandlerFunction();
    if (dangerous[funcName]) {
      Logger.log('🚨 DANGER: ' + funcName);
      Logger.log('   ' + dangerous[funcName]);
      Logger.log('   Trigger ID: ' + trigger.getUniqueId());
      Logger.log('   Event: ' + trigger.getEventType());
      Logger.log('');
      foundDangerous = true;
    }
  });

  if (!foundDangerous) {
    Logger.log('✅ No dangerous triggers found');
  } else {
    Logger.log('');
    Logger.log('⚠️ RECOMMENDATION: Delete these triggers immediately');
    Logger.log('Run: deleteTriggerById("trigger-id")');
  }

  Logger.log('='.repeat(80));
}
