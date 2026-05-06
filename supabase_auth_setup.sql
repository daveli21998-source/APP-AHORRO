-- =====================================================
-- APP AHORROS — Sistema de Autenticación y Roles
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nombre TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'cobrador' CHECK (role IN ('admin', 'cobrador')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS (Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. Política: Los usuarios pueden leer su propio perfil
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- 4. Política: Los admins pueden leer todos los perfiles
CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 5. Trigger: Crear perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'cobrador')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si ya existe para evitar duplicados
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- INSTRUCCIONES:
-- 1. Ejecuta este SQL en tu panel de Supabase (SQL Editor)
-- 2. Luego crea usuarios desde Authentication > Users
-- 3. Para hacer admin al primer usuario, ejecuta:
--    UPDATE profiles SET role = 'admin' WHERE id = 'TU_USER_UUID';
-- =====================================================
