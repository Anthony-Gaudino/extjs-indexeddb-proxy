/**
 * IndexedDB proxy.
 *
 * This proxy provides use of the Browser IndexedDB to save
 * {@link Ext.data.Model Model} data locally on the client browser.
 *
 * Let's imagine we're writing a Twitter search application and want to save
 * the user's searches locally so they can easily perform a saved search again
 * later. We'd start by creating a Search model:
 *
 * @example
 *     Ext.define('Search', {
 *         fields : ['id', 'query'],
 *         extend : 'Ext.data.Model',
 *         proxy: new MYPROJ.app.data.proxy.IndexedDB({
 *             dbName          : 'twitter',
 *             objectStoreName : 'searches'
 *         })
 *     });
 *
 * Our Search model contains just two fields - id and query - plus a Proxy
 * definition. The only configuration we need to pass to the IndexedDB proxy
 * are {@link #dbName} and {@link #objectStoreName}. This is important as it
 * separates the Model data in this Proxy from all others. The IndexedDB API
 * puts all data into a single database and objectStore pair, so by setting the
 * `dbName` and `objectStoreName` we enable IndexedDBProxy to manage the saved
 * Search data.
 *
 * We can also specify the database version, specifying a different version than
 * the one before will remove the previous database if it exists:
 *
 * @example
 *     Ext.define('Search', {
 *         fields : ['id', 'query'],
 *         extend : 'Ext.data.Model',
 *         proxy: new MYPROJ.app.data.proxy.IndexedDB({
 *             dbName          : 'twitter',
 *             objectStoreName : 'searches'
 *             dbVersion       : 2
 *         })
 *     });
 *
 * The default database version is 1.
 *
 * Saving our data into IndexedDB is easy and would usually be done with a
 * {@link Ext.data.Store Store}:
 *
 * @example
 *     // Our Store automatically picks up the IndexedDBProxy defined on the
 *     // Search model.
 *     const store = Ext.create('Ext.data.Store', { model: "Search" });
 *
 *     // Loads any existing Search data from IndexedDB.
 *     store.load();
 *
 *     // Now add some Searches.
 *     store.add({query: 'Sencha Touch'});
 *     store.add({query: 'Ext JS'});
 *
 *     // Finally, save our Search data to IndexedDB.
 *     store.sync();
 *
 * The IndexedDBProxy uses the same IDs automatically that exist on the store.
 * Calling `store.sync()` places the model into the IndexedDB database.
 * We can also save directly to IndexedDB, bypassing the Store altogether:
 *
 * @example
 *     const search = Ext.create('Search', {query: 'Sencha Animator'});
 *
 *     // Uses the configured IndexedDBProxy to save the new Search to
 *     // IndexedDB.
 *     search.save();
 *
 *
 * # Limitations
 *
 * If this proxy is used in a browser where IndexedDB is not supported, the
 * constructor will throw an error.
 *
 * This proxy requires a unique `dbName` and
 * `objectStoreName` which are used to identify the database and objectStore.
 * If the `dbName` and `objectStoreName` are not supplied the proxy will throw
 * an error.
 *
 * This proxy checks if the internal data is hierarchical by testing if a single
 * entry has a `leaf` or `parentId` property. You can set the isHierarchical
 * property of the proxy to define this ahead of time and don't check when the
 * proxy is instantiated:
 *
 * @example
 *     proxy: new MYPROJ.app.data.proxy.IndexedDB({
 *         dbName          : 'twitter',
 *         objectStoreName : 'searches',
 *         isHierarchical  : true
 *     })
 *
 *
 * # Implementation details
 *
 * ExtJS creates an internal reference for the CRUD operations, (methods
 * create, update, erase and read) so, these must not be asynchronous, that's
 * why they have a nested anonymous asynchronous function inside.
 */
Ext.define('MYPROJ.app.data.proxy.IndexedDB', {
   extend             : 'Ext.data.proxy.Proxy',
   alternateClassName : 'MYPROJ.data.IndexedDBProxy',

   /**
    * @cfg {Object} reader
    * Not used by web storage proxy.
    * @hide
    */

   /**
    * @cfg {Object} writer
    * Not used by web storage proxy.
    * @hide
    */

   /**
    * Name of database
    *
    * @property {string} dbName
    * @private
    */
   dbName: undefined,

   /**
    * Database version.
    *
    * @property {number} dbVersion
    * @private
    */
   dbVersion: 1,

   /**
    * Name of object store.
    *
    * @property {string} objectStoreName
    * @private
    * @readonly
    */
   objectStoreName: undefined,

   /**
    * Primary key for objectStore. Proxy will use the model idProperty.
    *
    * @property {string} keyPath
    * @private
    */
   keyPath: undefined,

   /**
    * Defines if the internal data is hierarchical.
    *
    * @property {boolean} isHierarchical
    * @private
    */
   isHierarchical: undefined,

   /**
    * DB object.
    *
    * @property {Object} db
    * @private
    */
   db: undefined,

   /**
    * Creates the proxy.
    *
    * @throws {IndexedDBNotSupported} If IndexedDB is not supported in
    * the current browser.
    * @throws {dbNameNotDefined} If `dbName` was not defined in the proxy.
    * @throws {objectStoreNameNotDefined} If `objectStoreName` was not defined
    *     in the proxy.
    *
    * @param {Object} config (optional) Config object.
    */
   constructor(config) {
      this.callParent(arguments);

      /**
       * Cached map of records already retrieved by this Proxy. Ensures that
       * the same instance is always retrieved.
       *
       * @property {Object} cache
       */
      this.cache = {};

      if (!window.indexedDB) {
         Ext.raise('IndexedDB is not supported in this browser.');
      }

      if (!this.dbName || typeof this.dbName !== 'string') {
         Ext.raise('The dbName string has not been defined.');
      }

      if (!this.objectStoreName || typeof this.objectStoreName !== 'string') {
         Ext.raise('The objectStoreName string has not been defined.');
      }

      /**
       * Promise used to check if the proxy is initialized.
       *
       * @property {Promise} initialized
       * @private
       */
      this.initialized = new Promise(async resolve => {
         await this.initialize();
         resolve();
      });
   },

   /**
    * @inheritdoc
    */
   create(operation) { (async () => {
      await this.initialized;

      const records = operation.getRecords();

      if (!this.isHierarchical) {
         // If the storage object does not yet contain any data, this is the
         // first point at which we can determine whether or not this proxy
         // deals with hierarchical data. It cannot be determined during
         // initialization because the Model is not decorated with
         // NodeInterface until it is used in a TreeStore.
         this.isHierarchical = !!records[0].isNode;
      }

      for (const record of records) {
         record.phantom = false;

         await this.setRecord(record);
         record.commit();
      }

      operation.setSuccessful(true);
   })();},

   /**
    * @inheritdoc
    */
   read(operation) { (async () => {
      await this.initialized;

      const records       = [];
      const Model         = this.getModel();
      const recordCreator = operation.getRecordCreator();
      const totalRecords  = await this.db.count(this.objectStoreName);

      let validCount = 0;
      let success    = true;

      if (this.isHierarchical) {
         records.push(...await this.getTreeData());
      } else {
         const id = operation.getId();

         // Read a single record.
         if (id) {
            const data = await this.getRecord(id);

            const record = data
               ? (recordCreator ? recordCreator(data, Model) : new Model(data))
               : null;

            if (record) {
               records.push(record);
            } else {
               success = false;
            }
         } else {
            const sorters = operation.getSorters() || [];
            const filters = operation.getFilters() || [];
            const limit   = operation.getLimit();

            // Build an array of all records first first so we can sort them
            // before applying filters or limit. These are Model instances
            // instead of raw data objects so that the sorter and filter Fn can
            // use the Model API.
            const allRecords = (await this.db.getAll(this.objectStoreName)).map(
               data => recordCreator ? recordCreator(data, Model)
                                     : new Model(data)
            );

            Ext.Array.sort(allRecords, Ext.util.Sorter.createComparator(sorters));

            for (let i = operation.getStart() || 0; i < totalRecords; i++) {
               const record = allRecords[i];

               let valid = true;

               filters.forEach(f => valid = f.filter(record));

               if (valid) {
                  records.push(record);
                  validCount++;
               }

               if (limit && validCount === limit)    break;
            }
         }
      }

      if (success) {
         operation.setResultSet(new Ext.data.ResultSet({
            records : records,
            count   : records.length,
            total   : totalRecords,
            loaded  : true
         }));

         operation.setSuccessful(true);
      } else {
         operation.setException('Unable to load records');
      }
   })();},

   /**
    * @inheritdoc
    */
   update(operation) { (async () => {
      await this.initialized;

      const records = operation.getRecords();

      for (const record of records) {
         await this.setRecord(record);
         record.commit();
      }

      operation.setSuccessful(true);
   })();},

   /**
    * @inheritdoc
    */
   erase(operation) { (async () => {
      await this.initialized;

      const records = operation.getRecords();

      for (const record of records)    await this.removeRecord(record);

      operation.setSuccessful(true);
   })();},

   /**
    * Fetches record data from the Proxy by ID.
    *
    * @param {String} id The record's unique ID
    *
    * @return {Object} The record data
    *
    * @private
    */
   async getRecord(id) {
      const cache = this.cache;
      const data  = cache[id] || await this.db.get(this.objectStoreName, id);

      if (!data)    return null;

      cache[id] = data;

      // In order to preserve the cache, we MUST copy it here because Models
      // use the incoming raw data as their data object and convert/default
      // values into that object.
      return Ext.merge({}, data);
   },

   /**
    * Saves the given record in the Proxy.
    *
    * @param {Ext.data.Model} record - The model instance.
    */
   async setRecord(record) {
      const rawData = record.getData();
      const data    = {};
      const model   = this.getModel();
      const fields  = model.getFields();

      fields.forEach(field => {
         const name = field.name;

         if (field.persist) {
            let value = rawData[name];

            data[name] = value;
         }
      });

      // If the record is a tree node and it's a direct child of the root node,
      // do not store the parentId.
      if (record.isNode && record.get('depth') === 1)    delete data.parentId;

      const id = await this.db.put(this.objectStoreName, data);

      record.set('id', id, { commit: true });

      // Keep the cache up to date.
      this.cache[id] = data;
   },

   /**
    * Physically removes a given record from the local storage and recursively
    * removes children if the record is a tree node. Used internally by
    * {@link #destroy}.
    *
    * @param {Ext.data.Model} record - The record to remove.
    *
    * @return {Object} A hash with the ids of the records that were removed as
    *     keys and the records that were removed as values.
    *
    * @private
    */
   async removeRecord(record) {
      const id      = record.getId();
      const records = {};

      records[id] = record;

      await this.db.delete(this.objectStoreName, id);
      delete this.cache[id];

      if (record.childNodes) {
         for (const childNode of record.childNodes) {
            Ext.apply(records, await this.removeRecord(childNode));
         }
      }

      return records;
   },

   /**
    * Returns the array of record IDs stored in this Proxy.
    *
    * @return {Number[]} The record IDs. Each is cast as a Number
    *
    * @private
    */
   async getIds() {
      return (await this.db).getAllKeys(this.objectStoreName);
   },

   /**
    * Gets tree data and transforms it from key value pairs into a hierarchical
    * structure.
    *
    * @return {Ext.data.NodeInterface[]}
    *
    * @private
    */
   async getTreeData() {
      const records    = await this.db.getAll(this.objectStoreName);
      const recordHash = {};
      const root       = [];
      const Model      = this.getModel();

      let parent;
      let children;

      for (const record of records) {
         // Add the record to the record hash so it can be easily retrieved by
         // id later.
         recordHash[ record[this.keyPath] ] = record;

         if (!record.parentId) {
            // Push records that are at the root level (those with no parent id)
            // into the "root" array.
            root.push(record);
         }
      }

      // Sort the records by parent id for greater efficiency, so that each
      // parent record only has to be found once for all of its children.
      Ext.Array.sort(records, this.sortByParentId);

      // Append each record to its parent, starting after the root node(s),
      // since root nodes do not need to be attached to a parent.
      for (let i = root.length; i < records.length; i++) {
         const record   = records[i];
         const parentId = record.parentId;

         if (!parent || parent[this.keyPath] !== parentId) {
            // If this record has a different parent id from the previous
            // record, we need to look up the parent by id.
            parent = recordHash[parentId];
            parent.children = children = [];
         }

         // Push the record onto its parent's children array.
         children.push(record);
      }

      for (const record of records) {
         if (!record.children && !record.leaf) {
            // Set non-leaf nodes with no children to loaded so the proxy won't
            // try to dynamically load their contents when they are expanded.
            record.loaded = true;
         }
      }

      // Create model instances out of all the "root-level" nodes.
      root.forEach((record, i) => root[i] = new Model(record));

      return root;
   },

   /**
    * Sorter function for sorting records by parentId.
    *
    * @param {Object} node1
    * @param {Object} node2
    *
    * @return {Number}
    *
    * @private
    */
   sortByParentId(node1, node2) {
      return (node1.parentId || 0) - (node2.parentId || 0);
   },

   /**
    * Sets up the Proxy by opening the IndexedDB, if the database needs upgrade
    * and a objectStore with same name exists, it will be removed.
    *
    * This should not need to be called again unless {@link #clear} has been
    * called.
    *
    * @private
    */
   async initialize() {
      this.keyPath = this.getModel().idProperty;
      const me     = this;

      const db = await idb.openDB(this.dbName, this.dbVersion, { upgrade(db) {
         if (db.objectStoreNames.contains(me.objectStoreName)) {
            db.deleteObjectStore(me.objectStoreName);
         }

         // Create objectStore.
         //
         // The keyPath used in the IndexedDB is the `idProperty` defined in
         // the model, if no `idProperty` is defined, it uses the default model
         // ID (`id`). The IndexedDB Object Store will have autoIncrement keys.
         db.createObjectStore(
            me.objectStoreName,
            { keyPath: me.keyPath, autoIncrement: true }
         );
      } });

      this.db = db;

      if (this.isHierarchical === undefined) {
         // To check if this is a hierarchical database we must read everything
         // as we don't know the IDs and indexes and also there's no function
         // to read the first or last entry. So we read everything and since we
         // have all data we save time later by loading it into the cache.
         const records = await this.db.getAll(this.objectStoreName);

         if (records.length) {
            this.isHierarchical = records[0].leaf || records[0].parentId
                                ? true : false;
         }

         records.forEach(record => this.cache[ record[this.keyPath] ] = record);
      }
   },

   /**
    * Destroys all records stored in the proxy and removes all keys and values
    * used to support the proxy from the storage object.
    */
   clear() { (async () => {
      await this.initialized;

      this.db.clear(this.objectStoreName);

      // Clear the cache.
      this.cache = {};
   })();},
});
