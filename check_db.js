
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('https://hbqefylulydnsulfbbta.supabase.co', 'sb_publishable_hZAx1d02PUruCRVoANWXDA_0Hr1ZOD0')

async function check() {
  const { data, error } = await supabase.from('ahorros_clientes').select('*').limit(5)
  if (error) {
    console.error(error)
  } else {
    console.log(JSON.stringify(data, null, 2))
  }
}
check()
