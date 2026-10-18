import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://svyqunrdgbgxxgmeerba.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variable: SUPABASE_SERVICE_ROLE_KEY')
  console.error('Please set SUPABASE_SERVICE_ROLE_KEY and try again.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface SeedUserDef {
  email: string
  password: string
  full_name: string
  level: 'owner' | 'admin' | 'user'
}

const SEED_USERS: SeedUserDef[] = [
  { email: 'owner@demo.com', password: 'Pass123!', full_name: 'Owner Demo', level: 'owner' },
  { email: 'admin@demo.com', password: 'Pass123!', full_name: 'Admin Demo', level: 'admin' },
  { email: 'manager@demo.com', password: 'Pass123!', full_name: 'Manager Demo', level: 'user' },
  { email: 'sales1@demo.com', password: 'Pass123!', full_name: 'Sales One', level: 'user' },
  { email: 'sales2@demo.com', password: 'Pass123!', full_name: 'Sales Two', level: 'user' }
]

async function seed() {
  console.log('🚀 Starting LeadFlow database seed...')

  // 1. Create or fetch 5 auth users
  console.log('\n1. Setting up auth users...')
  const userMap = new Map<string, { id: string; email: string; full_name: string; level: 'owner' | 'admin' | 'user' }>()

  // Fetch existing users to check if any exist
  const { data: listData, error: listError } = await supabase.auth.admin.listUsers()
  if (listError) {
    throw new Error(`Failed to list auth users: ${listError.message}`)
  }
  const existingAuthUsers = listData?.users || []

  for (const u of SEED_USERS) {
    const existing = existingAuthUsers.find(
      eau => eau.email?.toLowerCase() === u.email.toLowerCase()
    )

    if (existing) {
      console.log(`  Found existing user: ${u.email} (${existing.id})`)
      userMap.set(u.email, {
        id: existing.id,
        email: u.email,
        full_name: u.full_name,
        level: u.level
      })
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: u.email,
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.full_name }
      })

      if (createError) {
        // Fallback check if user was created concurrently
        const { data: retryList } = await supabase.auth.admin.listUsers()
        const retryUser = retryList?.users?.find(
          eau => eau.email?.toLowerCase() === u.email.toLowerCase()
        )
        if (retryUser) {
          console.log(`  Found user after conflict: ${u.email} (${retryUser.id})`)
          userMap.set(u.email, {
            id: retryUser.id,
            email: u.email,
            full_name: u.full_name,
            level: u.level
          })
        } else {
          throw new Error(`Failed to create auth user ${u.email}: ${createError.message}`)
        }
      } else if (created.user) {
        console.log(`  Created user: ${u.email} (${created.user.id})`)
        userMap.set(u.email, {
          id: created.user.id,
          email: u.email,
          full_name: u.full_name,
          level: u.level
        })
      }
    }
  }

  // 2. Create or reuse ONE workspace named 'Demo Co' with slug 'demo'
  console.log('\n2. Setting up workspace...')
  let workspaceId: string
  const { data: existingWorkspace, error: wsFetchErr } = await supabase
    .from('workspaces')
    .select('id, name, slug')
    .eq('slug', 'demo')
    .maybeSingle()

  if (wsFetchErr) {
    throw new Error(`Error fetching workspace: ${wsFetchErr.message}`)
  }

  if (existingWorkspace) {
    workspaceId = existingWorkspace.id
    console.log(`  Reusing workspace 'Demo Co' (${workspaceId})`)
  } else {
    const { data: newWs, error: newWsErr } = await supabase
      .from('workspaces')
      .insert({
        name: 'Demo Co',
        slug: 'demo'
      })
      .select('id')
      .single()

    if (newWsErr) {
      throw new Error(`Error creating workspace: ${newWsErr.message}`)
    }
    workspaceId = newWs.id
    console.log(`  Created workspace 'Demo Co' (${workspaceId})`)
  }

  // 3. Insert/upsert into profiles for each user
  console.log('\n3. Upserting user profiles...')
  for (const u of SEED_USERS) {
    const user = userMap.get(u.email)!
    const { error: profileErr } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        workspace_id: workspaceId,
        email: u.email,
        full_name: u.full_name,
        level: u.level,
        status: 'available',
        is_active: true
      }, { onConflict: 'id' })

    if (profileErr) {
      throw new Error(`Failed to upsert profile for ${u.email}: ${profileErr.message}`)
    }
    console.log(`  Profile upserted: ${u.email} (level: ${u.level}, status: available)`)
  }

  // 4. Configure assignment_rules
  console.log('\n4. Configuring assignment rules...')
  const managerProfile = userMap.get('manager@demo.com')!
  const adminProfile = userMap.get('admin@demo.com')!

  const { error: rulesErr } = await supabase
    .from('assignment_rules')
    .upsert({
      workspace_id: workspaceId,
      ack_window_seconds: 10,
      level_window_seconds: 10,
      max_open_leads: 5,
      backup_user_id: managerProfile.id,
      manager_user_id: adminProfile.id,
      round_robin: true,
      escalation_levels: 3,
      idle_period_seconds: 3600,
      ack_leave_policy: 'keep'
    }, { onConflict: 'workspace_id' })

  if (rulesErr) {
    throw new Error(`Failed to upsert assignment rules: ${rulesErr.message}`)
  }
  console.log('  Assignment rules configured: ack_window=10s, level_window=10s, max_open=5')

  // 5. Create role "Manager" in roles for the workspace, insert role_permissions, update manager profile.role_id
  console.log('\n5. Setting up Manager role and permissions...')
  let managerRoleId: string
  const { data: existingRole, error: roleFetchErr } = await supabase
    .from('roles')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'Manager')
    .maybeSingle()

  if (roleFetchErr) {
    throw new Error(`Error fetching role: ${roleFetchErr.message}`)
  }

  if (existingRole) {
    managerRoleId = existingRole.id
    console.log(`  Found existing Manager role (${managerRoleId})`)
  } else {
    const { data: newRole, error: newRoleErr } = await supabase
      .from('roles')
      .insert({
        workspace_id: workspaceId,
        name: 'Manager'
      })
      .select('id')
      .single()

    if (newRoleErr) {
      throw new Error(`Failed to create Manager role: ${newRoleErr.message}`)
    }
    managerRoleId = newRole.id
    console.log(`  Created Manager role (${managerRoleId})`)
  }

  const managerPermissions = [
    'crm.view',
    'crm.create',
    'crm.edit',
    'value.view',
    'assignment.manage',
    'audit.view',
    'users.manage'
  ]

  for (const perm of managerPermissions) {
    const { error: permErr } = await supabase
      .from('role_permissions')
      .upsert({
        role_id: managerRoleId,
        permission: perm
      }, { onConflict: 'role_id,permission' })

    if (permErr) {
      throw new Error(`Failed to upsert permission ${perm}: ${permErr.message}`)
    }
  }
  console.log(`  Granted permissions to Manager role: ${managerPermissions.join(', ')}`)

  // Update manager's profile.role_id
  const { error: updateManagerRoleErr } = await supabase
    .from('profiles')
    .update({ role_id: managerRoleId })
    .eq('id', managerProfile.id)

  if (updateManagerRoleErr) {
    throw new Error(`Failed to assign Manager role to profile: ${updateManagerRoleErr.message}`)
  }
  console.log('  Updated Manager profile with Manager role_id')

  // 6. Create 2 pipelines "Sales" and "Support" with stages: New(0), Contacted(1), Qualified(2), Won(3,is_won), Lost(4,is_lost)
  console.log('\n6. Setting up Pipelines and Stages...')
  const pipelinesToCreate = ['Sales', 'Support']
  const stageDefinitions = [
    { name: 'New', position: 0, is_won: false, is_lost: false },
    { name: 'Contacted', position: 1, is_won: false, is_lost: false },
    { name: 'Qualified', position: 2, is_won: false, is_lost: false },
    { name: 'Won', position: 3, is_won: true, is_lost: false },
    { name: 'Lost', position: 4, is_won: false, is_lost: true }
  ]

  const pipelineMap = new Map<string, { id: string; stages: Array<{ id: string; name: string }> }>()

  for (const pName of pipelinesToCreate) {
    let pId: string
    const { data: existingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('name', pName)
      .maybeSingle()

    if (existingPipeline) {
      pId = existingPipeline.id
      console.log(`  Reusing pipeline: ${pName} (${pId})`)
    } else {
      const { data: newP, error: newPErr } = await supabase
        .from('pipelines')
        .insert({
          workspace_id: workspaceId,
          name: pName
        })
        .select('id')
        .single()

      if (newPErr) {
        throw new Error(`Failed to create pipeline ${pName}: ${newPErr.message}`)
      }
      pId = newP.id
      console.log(`  Created pipeline: ${pName} (${pId})`)
    }

    const stagesList: Array<{ id: string; name: string }> = []
    for (const stageDef of stageDefinitions) {
      let stageId: string
      const { data: existingStage } = await supabase
        .from('stages')
        .select('id')
        .eq('pipeline_id', pId)
        .eq('name', stageDef.name)
        .maybeSingle()

      if (existingStage) {
        stageId = existingStage.id
        await supabase
          .from('stages')
          .update({
            position: stageDef.position,
            is_won: stageDef.is_won,
            is_lost: stageDef.is_lost
          })
          .eq('id', stageId)
      } else {
        const { data: newStage, error: stageErr } = await supabase
          .from('stages')
          .insert({
            workspace_id: workspaceId,
            pipeline_id: pId,
            name: stageDef.name,
            position: stageDef.position,
            is_won: stageDef.is_won,
            is_lost: stageDef.is_lost
          })
          .select('id')
          .single()

        if (stageErr) {
          throw new Error(`Failed to create stage ${stageDef.name} in ${pName}: ${stageErr.message}`)
        }
        stageId = newStage.id
      }
      stagesList.push({ id: stageId, name: stageDef.name })
    }
    pipelineMap.set(pName, { id: pId, stages: stagesList })
  }

  // 7. Create 2 custom_fields on Sales pipeline (entity='opportunity'):
  // - name='Source', field_key='source', type='dropdown', options=["Referral","Web","Cold"]
  // - name='Expected Close', field_key='expected_close', type='date'
  console.log('\n7. Setting up custom fields on Sales pipeline...')
  const salesPipeline = pipelineMap.get('Sales')!

  const customFieldDefs = [
    {
      name: 'Source',
      field_key: 'source',
      type: 'dropdown',
      options: ['Referral', 'Web', 'Cold'],
      position: 0
    },
    {
      name: 'Expected Close',
      field_key: 'expected_close',
      type: 'date',
      options: [],
      position: 1
    }
  ]

  for (const cf of customFieldDefs) {
    const { data: existingCf } = await supabase
      .from('custom_fields')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('pipeline_id', salesPipeline.id)
      .eq('field_key', cf.field_key)
      .maybeSingle()

    if (existingCf) {
      await supabase
        .from('custom_fields')
        .update({
          name: cf.name,
          type: cf.type,
          options: cf.options,
          position: cf.position
        })
        .eq('id', existingCf.id)
      console.log(`  Updated custom field: ${cf.name}`)
    } else {
      const { error: cfErr } = await supabase
        .from('custom_fields')
        .insert({
          workspace_id: workspaceId,
          entity: 'opportunity',
          pipeline_id: salesPipeline.id,
          name: cf.name,
          field_key: cf.field_key,
          type: cf.type,
          options: cf.options,
          position: cf.position
        })

      if (cfErr) {
        throw new Error(`Failed to create custom field ${cf.name}: ${cfErr.message}`)
      }
      console.log(`  Created custom field: ${cf.name}`)
    }
  }

  // 8. Create 8 contacts with fake names/phones (+92300XXXXXXX) + 1 companies row "Acme Corp"
  console.log('\n8. Setting up company and contacts...')
  let companyId: string
  const { data: existingCompany } = await supabase
    .from('companies')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('name', 'Acme Corp')
    .maybeSingle()

  if (existingCompany) {
    companyId = existingCompany.id
    console.log(`  Found existing company: Acme Corp (${companyId})`)
  } else {
    const { data: newCompany, error: compErr } = await supabase
      .from('companies')
      .insert({
        workspace_id: workspaceId,
        name: 'Acme Corp'
      })
      .select('id')
      .single()

    if (compErr) {
      throw new Error(`Failed to create Acme Corp company: ${compErr.message}`)
    }
    companyId = newCompany.id
    console.log(`  Created company: Acme Corp (${companyId})`)
  }

  const fakeContacts = [
    { name: 'Ali Khan', phone: '+923001234501', email: 'ali.khan@demo.com' },
    { name: 'Fatima Ahmed', phone: '+923001234502', email: 'fatima.ahmed@demo.com' },
    { name: 'Bilal Hassan', phone: '+923001234503', email: 'bilal.hassan@demo.com' },
    { name: 'Zainab Tariq', phone: '+923001234504', email: 'zainab.tariq@demo.com' },
    { name: 'Hamza Malik', phone: '+923001234505', email: 'hamza.malik@demo.com' },
    { name: 'Ayesha Raza', phone: '+923001234506', email: 'ayesha.raza@demo.com' },
    { name: 'Usman Farooq', phone: '+923001234507', email: 'usman.farooq@demo.com' },
    { name: 'Sara Siddiqui', phone: '+923001234508', email: 'sara.siddiqui@demo.com' }
  ]

  const contactIds: string[] = []
  for (const fc of fakeContacts) {
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('phone', fc.phone)
      .maybeSingle()

    if (existingContact) {
      contactIds.push(existingContact.id)
    } else {
      const { data: newContact, error: cErr } = await supabase
        .from('contacts')
        .insert({
          workspace_id: workspaceId,
          company_id: companyId,
          name: fc.name,
          phone: fc.phone,
          email: fc.email
        })
        .select('id')
        .single()

      if (cErr) {
        throw new Error(`Failed to create contact ${fc.name}: ${cErr.message}`)
      }
      contactIds.push(newContact.id)
    }
  }
  console.log(`  Ensured 8 contacts linked to Acme Corp`)

  // 9. Create 6 opportunities spread across stages, each linked to a contact + pipeline + stage, owner_id=sales1.
  // Insert corresponding opportunity_values rows with value between 5000 and 50000.
  console.log('\n9. Setting up 6 opportunities and opportunity values...')
  const sales1Profile = userMap.get('sales1@demo.com')!

  const oppDefinitions = [
    { title: 'Acme ERP Modernization', stageIndex: 0, contactIndex: 0, value: 35000 },
    { title: 'Acme Cloud Migration', stageIndex: 0, contactIndex: 1, value: 24000 },
    { title: 'Acme Security & SOC 2 Audit', stageIndex: 1, contactIndex: 2, value: 16500 },
    { title: 'Acme API Gateway Integration', stageIndex: 2, contactIndex: 3, value: 29000 },
    { title: 'Acme Enterprise SLA Retainer', stageIndex: 3, contactIndex: 4, value: 48000 },
    { title: 'Acme Legacy Telephony Sunset', stageIndex: 4, contactIndex: 5, value: 8500 }
  ]

  for (const opp of oppDefinitions) {
    const stage = salesPipeline.stages[opp.stageIndex]
    const contactId = contactIds[opp.contactIndex]

    let oppId: string
    const { data: existingOpp } = await supabase
      .from('opportunities')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('title', opp.title)
      .maybeSingle()

    if (existingOpp) {
      oppId = existingOpp.id
      await supabase
        .from('opportunities')
        .update({
          contact_id: contactId,
          pipeline_id: salesPipeline.id,
          stage_id: stage.id,
          owner_id: sales1Profile.id,
          payment_status: opp.stageIndex === 3 ? 'paid' : 'unpaid'
        })
        .eq('id', oppId)
    } else {
      const { data: newOpp, error: oppErr } = await supabase
        .from('opportunities')
        .insert({
          workspace_id: workspaceId,
          contact_id: contactId,
          pipeline_id: salesPipeline.id,
          stage_id: stage.id,
          title: opp.title,
          owner_id: sales1Profile.id,
          version: 1,
          payment_status: opp.stageIndex === 3 ? 'paid' : 'unpaid'
        })
        .select('id')
        .single()

      if (oppErr) {
        throw new Error(`Failed to create opportunity ${opp.title}: ${oppErr.message}`)
      }
      oppId = newOpp.id
    }

    const { error: valErr } = await supabase
      .from('opportunity_values')
      .upsert({
        opportunity_id: oppId,
        workspace_id: workspaceId,
        value: opp.value,
        currency: 'USD'
      }, { onConflict: 'opportunity_id' })

    if (valErr) {
      throw new Error(`Failed to upsert opportunity value for ${opp.title}: ${valErr.message}`)
    }
  }
  console.log(`  Created/updated 6 opportunities with values across stages (owner: sales1)`)

  // 10. Print a summary: counts of users, contacts, opportunities, leads.
  console.log('\n10. Fetching summary counts...')
  const { count: usersCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count: contactsCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count: oppsCount } = await supabase
    .from('opportunities')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  const { count: leadsCount } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)

  console.log('\n========================================')
  console.log('           SEED SUMMARY')
  console.log('========================================')
  console.log(`Users (Profiles): ${usersCount ?? 0}`)
  console.log(`Contacts:         ${contactsCount ?? 0}`)
  console.log(`Opportunities:    ${oppsCount ?? 0}`)
  console.log(`Leads:            ${leadsCount ?? 0}`)
  console.log('========================================\n')

  console.log("✅ Seed complete. Try: log in as owner@demo.com / Pass123! and call bootstrap_workspace if not already done. Then submit a public lead via /api or from frontend with slug='demo'.")
}

seed().catch(err => {
  console.error('\n❌ Seed failed with error:', err)
  process.exit(1)
})
