import 'package:flutter/material.dart';
import '../staff/staff_home.dart';

class AdminHome extends StatelessWidget {
  const AdminHome({super.key});

  @override
  Widget build(BuildContext context) {
    return const StaffHome(role: "admin");
  }
}
