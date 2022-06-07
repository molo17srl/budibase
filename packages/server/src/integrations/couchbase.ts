import {
  Integration,
  DatasourceFieldTypes,
  QueryTypes,
  SqlQuery,
} from "../definitions/datasource"
import { IntegrationBase } from "./base/IntegrationBase"
import { Cluster, QueryOptions, QueryResult } from "couchbase"
import { datasourceValidator } from "../api/routes/utils/validators"
import { getSqlQuery } from "./utils"

module CouchbaseModule {
  const couchbase = require("couchbase")
  const environment = require("../environment")
  const retryErrorCodes = ["107", "100", "170", "201"]
  const defaultMaxRetries = 3

  interface CouchbaseConfig {
    certificatePath: string
    username: string
    password: string
    bucketName: string
    maxRetries: number
    connectionString: string
    bucket: string
  }

  const SCHEMA: Integration = {
    docs: "https://github.com/couchbase/couchnode",
    friendlyName: "Couchbase",
    description:
      "Couchbase Server is an open-source distributed (shared-nothing architecture) multi-model NoSQL document-oriented database",
    datasource: {
      username: {
        type: DatasourceFieldTypes.STRING,
        required: true,
        default: "Administrator",
      },
      password: {
        type: DatasourceFieldTypes.PASSWORD,
        required: true,
      },
      connectionString: {
        type: DatasourceFieldTypes.STRING,
        required: true,
        default: "couchbase://localhost",
      },
      bucketName: {
        type: DatasourceFieldTypes.STRING,
        required: true,
      },
      certificatePath: {
        type: DatasourceFieldTypes.STRING,
        required: false,
      },
    },
    query: {
      create: {
        type: QueryTypes.SQL,
      },
      read: {
        type: QueryTypes.SQL,
      },
      update: {
        type: QueryTypes.SQL,
      },
      delete: {
        type: QueryTypes.SQL,
      },
    },
  }

  class CouchbaseIntegration implements IntegrationBase {
    private config: CouchbaseConfig
    private cluster: Cluster

    constructor(config: CouchbaseConfig) {
      this.config = config

      this.cluster = couchbase.connect(config.connectionString, {
        username: this.config.username,
        password: this.config.password,
        security: {
          trustStorePath: this.config.certificatePath,
        },
        maxRetries: defaultMaxRetries,
      })

      this.cluster.bucket(this.config.bucketName)

      // This primary index is meant only to be used for DEV and TEST purposes, should not be used in Production
      if (environment.isTest()) {
        const query: SqlQuery = {
          sql: `CREATE PRIMARY INDEX primay_index_test_environment ON ${this.config.bucketName}`,
        }
        this.internalQuery(query, this.config.maxRetries)
      }
    }

    async connect() {
      return await this.cluster
    }

    // TO-DO: verify if needed
    // createObjectIds(json: any): object {
    //   const self = this
    //   function interpolateObjectIds(json: any) {
    //     for (let field of Object.keys(json)) {
    //       if (json[field] instanceof Object) {
    //         json[field] = self.createObjectIds(json[field])
    //       }
    //       if (field === "_id" && typeof json[field] === "string") {
    //         const id = json["_id"].match(
    //           /(?<=objectid\(['"]).*(?=['"]\))/gi
    //         )?.[0]
    //         if (id) {
    //           json["_id"] = ObjectID.createFromHexString(id)
    //         }
    //       }
    //     }
    //     return json
    //   }
    //
    //   if (Array.isArray(json)) {
    //     for (let i = 0; i < json.length; i++) {
    //       json[i] = interpolateObjectIds(json[i])
    //     }
    //     return json
    //   }
    //   return interpolateObjectIds(json)
    // }

    async internalQuery(query: SqlQuery, retry: number): Promise<any> {
      const client = this.cluster

      try {
        return await this.cluster.query(query.sql)
      } catch (err) {
        let message
        let code
        if (err instanceof Error) message = err.message
        else message = String(err)

        if (
          retryErrorCodes.includes(message) ||
          message == "parent cluster object has been closed"
        ) {
          this.connect()
          if (retry <= 0) {
            console.error(err)
            throw new Error("Couchbase max retries exceeded")
          }
          return await this.internalQuery(
            query,
            retry ? retry - 1 : this.config.maxRetries
          )
        } else {
          console.log("Unexpected error", err)
          throw err
        }
      }
    }

    async read(query: SqlQuery | string) {
      await this.connect()
      const response = await this.internalQuery(
        getSqlQuery(query),
        this.config.maxRetries
      )
      return response.recordset
    }

    async create(query: SqlQuery | string) {
      await this.connect()
      const response = await this.internalQuery(
        getSqlQuery(query),
        this.config.maxRetries
      )
      return response.recordset || [{ created: true }]
    }

    async update(query: SqlQuery | string) {
      await this.connect()
      const response = await this.internalQuery(
        getSqlQuery(query),
        this.config.maxRetries
      )
      return response.recordset || [{ updated: true }]
    }

    async delete(query: SqlQuery | string) {
      await this.connect()
      const response = await this.internalQuery(
        getSqlQuery(query),
        this.config.maxRetries
      )
      return response.recordset || [{ deleted: true }]
    }

    // TO-DO: verify if needed
    // async query(json: QueryJson) {
    //   const schema = this.config.schema
    //   await this.connect()
    //   if (schema && schema !== DEFAULT_SCHEMA && json?.endpoint) {
    //     json.endpoint.schema = schema
    //   }
    //   const operation = this._operation(json)
    //   const queryFn = (query: any, op: string) => this.internalQuery(query, op)
    //   const processFn = (result: any) =>
    //     result.recordset ? result.recordset : [{ [operation]: true }]
    //   return this.queryWithReturning(json, queryFn, processFn)
    // }
  }

  module.exports = {
    schema: SCHEMA,
    integration: CouchbaseIntegration,
  }
}
