import {
  Integration,
  DatasourceFieldTypes,
  QueryTypes,
  SqlQuery,
} from "../definitions/datasource"
import { IntegrationBase } from "./base/IntegrationBase"
import { getSqlQuery } from "./utils"
import {
  Cluster,
  connect,
  Bucket,
  Collection,
  QueryErrorContext,
  QueryResult,
  GetResult,
  MutationResult,
} from "couchbase"
import { result } from "lodash"

module CouchbaseModule {
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
      read: {
        type: QueryTypes.SQL,
      },
      insert: {
        type: QueryTypes.FIELDS,
        fields: {
          key: {
            type: DatasourceFieldTypes.STRING,
            required: true,
          },
          value: {
            type: DatasourceFieldTypes.STRING,
            required: true,
          },
        },
      },
      delete: {
        type: QueryTypes.FIELDS,
        fields: {
          id: {
            type: DatasourceFieldTypes.STRING,
            required: true,
          },
        },
      },
      get: {
        type: QueryTypes.FIELDS,
        fields: {
          id: DatasourceFieldTypes.STRING,
        },
      },
    },
  }

  class CouchbaseIntegration implements IntegrationBase {
    private config: CouchbaseConfig
    private cluster: Cluster | null = null
    private bucket: Bucket | null = null

    constructor(config: CouchbaseConfig) {
      this.config = config
    }

    async connect() {
      this.cluster = await connect(this.config.connectionString, {
        username: this.config.username,
        password: this.config.password,
        security: {
          trustStorePath: this.config.certificatePath,
        },
      })

      this.bucket = this.cluster.bucket(this.config.bucketName)

      return this.bucket
    }

    async internalQuery(query: SqlQuery, retry: number): Promise<QueryResult> {
      const bucket = await this.connect()
      try {
        return await bucket.cluster.query(query.sql)
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

    async internalKeyValueStatement(
      key: string,
      value: any,
      deletion: boolean,
      retry: number
    ): Promise<any> {
      const bucket = await this.connect()

      try {
        if (!deletion) {
          if (!value) {
            return await bucket.defaultCollection().get(key)
          } else {
            return await bucket.defaultCollection().upsert(key, value)
          }
        } else {
          return await bucket.defaultCollection().remove(key)
        }
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
          return await this.internalKeyValueStatement(
            key,
            value,
            deletion,
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
      const queryResult = await this.internalQuery(
        getSqlQuery(query),
        this.config.maxRetries
      )
      return queryResult.rows
    }

    async insert(query: { id: string; value: any }) {
      await this.connect()
      const result = await this.internalKeyValueStatement(
        query.id,
        query.value,
        false,
        this.config.maxRetries
      )
      return result as MutationResult
    }

    async delete(query: { id: string }) {
      await this.connect()
      const result = await this.internalKeyValueStatement(
        query.id,
        null,
        true,
        this.config.maxRetries
      )
      return result as MutationResult
    }

    async get(query: { id: string }) {
      await this.connect()
      const result = await this.internalKeyValueStatement(
        query.id,
        null,
        false,
        this.config.maxRetries
      )

      return (result as GetResult).content
    }
  }

  module.exports = {
    schema: SCHEMA,
    integration: CouchbaseIntegration,
  }
}
