import 'package:flutter/material.dart';
import '../staff/staff_home.dart';

class SuperAdminHome extends StatelessWidget {
  const SuperAdminHome({super.key});

  @override
  Widget build(BuildContext context) {
    return const StaffHome(role: "superadmin");
  }
}