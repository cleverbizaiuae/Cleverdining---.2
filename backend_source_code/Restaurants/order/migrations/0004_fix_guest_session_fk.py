# Generated manually to fix FK constraint mismatch

from django.db import migrations

class Migration(migrations.Migration):

    dependencies = [
        ('order', '0003_order_guest_session_cart_cartitem'),
        ('device', '0012_device_table_token_guestsession'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            -- Drop the incorrect constraint pointing to table_guestsession
            ALTER TABLE order_order DROP CONSTRAINT IF EXISTS order_order_guest_session_id_ae77f90f_fk_table_guestsession_id;
            
            -- Drop the correct constraint if it exists (to avoid duplicates/errors on rerun)
            ALTER TABLE order_order DROP CONSTRAINT IF EXISTS order_order_guest_session_id_fk_device_guestsession_id;
            ALTER TABLE order_order DROP CONSTRAINT IF EXISTS order_order_guest_session_id_bf5e6a88_fk_device_guestsession_id; 

            -- Add the correct constraint pointing to device_guestsession
            -- Note: Django typically names constraints like {app}_{model}_{field}_fk_{ref_table}_{ref_field}
            -- But we enforce a working constraint here.
            ALTER TABLE order_order 
            ADD CONSTRAINT order_order_guest_session_id_fk_device_guestsession_id 
            FOREIGN KEY (guest_session_id) 
            REFERENCES device_guestsession(id) 
            DEFERRABLE INITIALLY DEFERRED;
            """,
            reverse_sql="""
            -- Reverse operation is difficult as table_guestsession might not exist or contain data.
            -- leaving empty as this is a fix-forward migration.
            """
        ),
    ]
