import { events, migrations, tenancy } from "@budibase/backend-core"
import TestConfig from "../../tests/utilities/TestConfiguration"
import structures from "../../tests/utilities/structures"
import { MIGRATIONS } from "../"
import * as helpers from "./helpers"

jest.setTimeout(100000)

describe("migrations", () => {
  const config = new TestConfig()

  beforeAll(async () => {
    await config.init()
  })

  afterAll(() => {
    config.end()
  })

  describe("backfill", () => {
    it("runs app db migration", async () => {
      await config.doInContext(null, async () => {
        await config.createAutomation()
        await config.createAutomation(structures.newAutomation())
        await config.createDatasource()
        await config.createDatasource()
        await config.createLayout()
        await config.createQuery()
        await config.createQuery()
        await config.createRole()
        await config.createRole()
        await config.createTable()
        await config.createView()
        await config.createTable()
        await config.createView(structures.view(config.table._id))
        await config.createScreen()
        await config.createScreen()

        jest.clearAllMocks()
        const migration = MIGRATIONS.filter(
          m => m.name === "event_app_backfill"
        )[0]
        await migrations.runMigration(migration)

        expect(events.app.created).toBeCalledTimes(1)
        expect(events.app.published).toBeCalledTimes(1)
        expect(events.automation.created).toBeCalledTimes(2)
        expect(events.automation.stepCreated).toBeCalledTimes(1)
        expect(events.datasource.created).toBeCalledTimes(2)
        expect(events.layout.created).toBeCalledTimes(3)
        expect(events.query.created).toBeCalledTimes(2)
        expect(events.role.created).toBeCalledTimes(2)
        expect(events.table.created).toBeCalledTimes(3)
        expect(events.view.created).toBeCalledTimes(2)
        expect(events.view.calculationCreated).toBeCalledTimes(1)
        expect(events.view.filterCreated).toBeCalledTimes(1)
        expect(events.screen.created).toBeCalledTimes(2)
      })
    })
  })

  it("runs global db migration", async () => {
    await config.doInContext(null, async () => {
      const appId = config.prodAppId
      const roles = { [appId]: "role_12345" }
      await config.createUser(undefined, undefined, false, true, roles) // admin only
      await config.createUser(undefined, undefined, false, false, roles) // non admin non builder
      await config.createTable()
      await config.createRow()
      await config.createRow()

      const db = tenancy.getGlobalDB()
      await helpers.saveGoogleConfig(db)
      await helpers.saveOIDCConfig(db)
      await helpers.saveSettingsConfig(db)
      await helpers.saveSmtpConfig(db)

      jest.clearAllMocks()
      const migration = MIGRATIONS.filter(
        m => m.name === "event_global_backfill"
      )[0]
      await migrations.runMigration(migration)

      expect(events.user.created).toBeCalledTimes(3)
      expect(events.role.assigned).toBeCalledTimes(2)
      expect(events.user.permissionBuilderAssigned).toBeCalledTimes(1) // default test user
      expect(events.user.permissionAdminAssigned).toBeCalledTimes(1) // admin from above
      expect(events.rows.created).toBeCalledTimes(1)
      expect(events.rows.created).toBeCalledWith(2)
      expect(events.email.SMTPCreated).toBeCalledTimes(1)
      expect(events.auth.SSOCreated).toBeCalledTimes(2)
      expect(events.auth.SSOActivated).toBeCalledTimes(2)
      expect(events.org.logoUpdated).toBeCalledTimes(1)
      expect(events.org.nameUpdated).toBeCalledTimes(1)
      expect(events.org.platformURLUpdated).toBeCalledTimes(1)
    })
  })
})