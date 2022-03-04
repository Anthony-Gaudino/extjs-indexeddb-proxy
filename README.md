# ExtJS IndexedDB proxy

Allows to use the browser IndexedDB as an ExtJS proxy.

I could not find any other IndexedDB proxy for ExtJS online that looked good or
worked, so I wrote my own, taking into account how ExtJSs local storage proxy
worked.

This proxy allows you to read, write and remove data from IndexedDB. Tree data
is also supported but not throughout tested.

Please note that this was only tested on ExtJS modern version 6.2.1.167. If you
would like to use it on newer versions you will probably have to make changes
into the class.

## Setup

### IDB
The IndexedDB proxy uses the IDB library: https://github.com/jakearchibald/idb

Download IDB
https://github.com/jakearchibald/idb#using-external-script-reference and add it
to your ExtJS project by placing it into your `resources/scripts` directory
Example: `MYPROJ/resources/scripts/idb.js`. Then set up your project to load it
as a dependency by editing your project's `app.json` and in the `js` section
adding the file:
```js
/**
 * List of all JavaScript assets in the right execution order.
 * ...
 */
"js": [
  {
    "path": "resources/scripts/idb.js"
  }
]
```

### IndexedDB Proxy

Copy the `data` directory into your `app` directory. Example: `MYPROJ/app/data`.

## Usage

Let's imagine we're writing a Twitter search application and want to save the
user's searches locally so they can easily perform a saved search again later.
We'd start by creating a Search model:

```js
Ext.define('Search', {
    fields : ['id', 'query'],
    extend : 'Ext.data.Model',
    proxy: new MYPROJ.app.data.proxy.IndexedDB({
        dbName          : 'twitter',
        objectStoreName : 'searches'
    })
});
```

Our Search model contains just two fields - id and query - plus a Proxy
definition. The only configuration we need to pass to the IndexedDB proxy are
`dbName` and `objectStoreName`. This is important as it separates the Model
data in this Proxy from all others. The IndexedDB API puts all data into a
single database and objectStore pair, so by setting the `dbName` and
`objectStoreName` we enable IndexedDBProxy to manage the saved Search data.

We can also specify the database version, specifying a different version than
the one before will remove the previous database if it exists:

```js
Ext.define('Search', {
    fields : ['id', 'query'],
    extend : 'Ext.data.Model',
    proxy: new MYPROJ.app.data.proxy.IndexedDB({
        dbName          : 'twitter',
        objectStoreName : 'searches'
        dbVersion       : 2
    })
});
```

The default database version is 1.

Saving our data into IndexedDB is easy and would usually be done with a Store:

```js
// Our Store automatically picks up the IndexedDBProxy defined on the
// Search model.
const store = Ext.create('Ext.data.Store', { model: "Search" });

// Loads any existing Search data from IndexedDB.
store.load();

// Now add some Searches.
store.add({query: 'Sencha Touch'});
store.add({query: 'Ext JS'});

// Finally, save our Search data to IndexedDB.
store.sync();
```

The IndexedDBProxy uses the same IDs automatically that exist on the store.
Calling `store.sync()` places the model into the IndexedDB database. We can
also save directly to IndexedDB, bypassing the Store altogether:

```js
const search = Ext.create('Search', {query: 'Sencha Animator'});

// Uses the configured IndexedDBProxy to save the new Search to
// IndexedDB.
search.save();
```

Example of store using the IndexedDB Proxy:
```js
Ext.define('MYPROJ.store.MyStore', {
   extend     : 'Ext.data.Store',
   model      : 'MYPROJ.model.MyModel',
   alias      : 'my_store',
   storeId    : 'my_store_id',
   requires   : ['MYPROJ.app.data.proxy.IndexedDB'],
   remoteSort : true,
   autoLoad   : true,
   sorters    : [{property: 'date', direction: 'DESC'}],
   pageSize   : 20,

   proxy: new MYPROJ.app.data.proxy.IndexedDB({
      dbName          : 'mydb',
      objectStoreName : 'mystore',
      model           : 'MYPROJ.model.MyModel'
   })
});
```

### Limitations

If this proxy is used in a browser where IndexedDB is not supported, the
constructor will throw an error.

This proxy requires a unique `dbName` and `objectStoreName` which are used to
identify the database and objectStore. If the `dbName` and `objectStoreName` are
not supplied the proxy will throw an error.

This proxy checks if the internal data is hierarchical by testing if a single
entry has a `leaf` or `parentId` property. You can set the isHierarchical
property of the proxy to define this ahead of time and don't check when the
proxy is instantiated:

```js
proxy: new MYPROJ.app.data.proxy.IndexedDB({
   dbName          : 'twitter',
   objectStoreName : 'searches',
   isHierarchical  : true
})
```

Please check the IndexedDB proxy source comments and code for more details.
