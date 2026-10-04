import asyncio
from sqlalchemy import inspect
from app.database import engine, Base
import app.models  # load all models

async def main():
    async with engine.connect() as conn:
        def sync_check(sync_conn):
            inspector = inspect(sync_conn)
            db_tables = set(inspector.get_table_names())
            model_tables = set(Base.metadata.tables.keys())
            
            print("==================================================")
            print("1. TABLES IN DB BUT NOT IN SQLALCHEMY MODELS")
            print("==================================================")
            for t in sorted(db_tables - model_tables):
                print(f"  - {t}")
                
            print("\n==================================================")
            print("2. TABLES IN SQLALCHEMY MODELS BUT NOT IN DB")
            print("==================================================")
            for t in sorted(model_tables - db_tables):
                print(f"  - {t}")
                
            print("\n==================================================")
            print("3. COLUMN DIFFERENCES & TYPE / NULL MISMATCHES")
            print("==================================================")
            for t_name in sorted(model_tables & db_tables):
                model_table = Base.metadata.tables[t_name]
                db_cols = {c['name']: c for c in inspector.get_columns(t_name)}
                model_cols = {c.name: c for c in model_table.columns}
                
                # Missing in DB
                for c_name in set(model_cols.keys()) - set(db_cols.keys()):
                    print(f"  [MISSING IN DB] {t_name}.{c_name} (defined in model as {model_cols[c_name].type})")
                    
                # Missing in Model
                for c_name in set(db_cols.keys()) - set(model_cols.keys()):
                    print(f"  [MISSING IN MODEL] {t_name}.{c_name} (exists in DB as {db_cols[c_name]['type']})")
                    
                # Type / Nullable mismatch
                for c_name in set(model_cols.keys()) & set(db_cols.keys()):
                    m_col = model_cols[c_name]
                    d_col = db_cols[c_name]
                    
                    m_type = str(m_col.type).upper()
                    d_type = str(d_col['type']).upper()
                    m_null = m_col.nullable
                    d_null = d_col['nullable']
                    
                    if m_null != d_null:
                        print(f"  [NULL MISMATCH] {t_name}.{c_name}: model nullable={m_null} vs DB nullable={d_null}")
                        
                    m_base = m_type.split('(')[0]
                    d_base = d_type.split('(')[0]
                    
                    # Check INT vs BIGINT specifically
                    if m_base in ('INTEGER', 'INT') and d_base in ('BIGINT', 'INT8'):
                        print(f"  [INT vs BIGINT] {t_name}.{c_name}: Model is {m_type} but DB is {d_type}")
                    elif m_base in ('BIGINT', 'INT8') and d_base in ('INTEGER', 'INT'):
                        print(f"  [BIGINT vs INT] {t_name}.{c_name}: Model is {m_type} but DB is {d_type}")
                    elif m_base != d_base:
                        # Allow normal equivalents
                        allowed = [
                            ('DATETIME', 'TIMESTAMP WITH TIME ZONE'),
                            ('DATETIME', 'TIMESTAMP WITHOUT TIME ZONE'),
                            ('VARCHAR', 'TEXT'),
                            ('TEXT', 'VARCHAR'),
                            ('JSON', 'JSONB'),
                            ('JSONB', 'JSON'),
                        ]
                        if (m_base, d_base) not in allowed and (d_base, m_base) not in allowed:
                            print(f"  [TYPE MISMATCH] {t_name}.{c_name}: model {m_type} vs DB {d_type}")

            print("\n==================================================")
            print("4. FOREIGN KEYS & INDEXES AUDIT")
            print("==================================================")
            for t_name in sorted(model_tables & db_tables):
                db_fks = inspector.get_foreign_keys(t_name)
                db_indexes = inspector.get_indexes(t_name)
                indexed_cols = set()
                for idx in db_indexes:
                    for col in idx.get('column_names', []):
                        indexed_cols.add(col)
                        
                for fk in db_fks:
                    constrained = fk.get('constrained_columns', [])
                    for col in constrained:
                        if col not in indexed_cols:
                            print(f"  [UNINDEXED FK] {t_name}.{col} references {fk.get('referred_table')}.{fk.get('referred_columns')} but has NO index!")

        await conn.run_sync(sync_check)

if __name__ == '__main__':
    asyncio.run(main())
